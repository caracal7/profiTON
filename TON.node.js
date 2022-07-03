require('colors').enable();
const { createEndpoints, broadcast } = require('./../../../../.lib/createEndpoints');

const Validator = require("fastest-validator");
const validator = new Validator();

const TonWeb = require('tonweb');


console.log('--------------------------------------------------------------------------------------------');

// For calculations in the blockchain, we use BigNumber (BN.js). https://github.com/indutny/bn.js
// Don't use regular {Number} for coins, etc., it has not enough size and there will be loss of accuracy.

const BN = TonWeb.utils.BN;

// Blockchain does not operate with fractional numbers like `0.5`.
// `toNano` function converts TON to nanoton - smallest unit.
// 1 TON = 10^9 nanoton; 1 nanoton = 0.000000001 TON;
// So 0.5 TON is 500000000 nanoton

const toNano = TonWeb.utils.toNano;
const fromNano = TonWeb.utils.fromNano;

function connectTON() {
    const providerUrl = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const apiKey = '91cadd2afe572ee9ff00e79335022ad935330f72f7ba00d4a47d1b22e6426230';

    const tonweb = new TonWeb(new TonWeb.HttpProvider(providerUrl, { apiKey }));
    console.log('TON Version'.yellow, tonweb.version.red);

    //----------------------------------------------------------------------
    // PARTIES
    // The payment channel is established between two participants A and B.
    // Each has own secret key, which he does not reveal to the other.

    // New secret key can be generated by `tonweb.utils.newSeed()`
    tonweb.utils.newSeed(); // Uint8Array
    return { tonweb };
}

async function createWallet (tonweb, name, seed) {
    const _seed = TonWeb.utils.base64ToBytes(seed); // A's private (secret) key
    const keyPair = tonweb.utils.keyPairFromSeed(_seed); // Obtain key pair (public key and private key)

    const wallet = tonweb.wallet.create({ publicKey: keyPair.publicKey });
    const walletAddress = await wallet.getAddress(); // address of this wallet in blockchain
    const balance = await tonweb.getBalance(walletAddress);

    console.log(name.green, 'walletAddress: '.green, walletAddress.toString(true, true, true));
    console.log(name.yellow, 'balance'.yellow, balance, fromNano(balance));

    return {
        keyPair,
        wallet,
        walletAddress,
        balance: fromNano(balance)
    }
}



const OPERATIONS_TIMEOUT = 30;
const TICK_COST = 0.1;
const DEPLOY_FEE = '0.05';
const TOP_UP_FEE = '0.05';
const INIT_FEE = '0.06';
const CLOSE_CHANNEL_FEE = '0.07';
const STREAM_INTERVAL = 1000;
const STREAM_DURATION = 15000;
const QUESTION_COST = 1.2;


const sleep = ms => new Promise(r => setTimeout(() => r(), ms));

const randomInteger = (minimum, maximum) => Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;

async function tryRequest(func, { retryCount, sleepTime = 1000, errorMessage, errorFunc }) {
    try {
        await func(retryCount);
        return true;
    } catch(e) {
        if(errorMessage) console.log(errorMessage, retryCount);
        if(errorFunc) errorFunc();
        retryCount--;
        if(retryCount >= 0) {
            await sleep(sleepTime);
            return tryRequest(func, { retryCount, sleepTime, errorMessage, errorFunc });
        }
    }
}

const checkDeposit = validator.compile({
    deposit: { type: "number", positive: true, max: 100, convert: true }, //  настроить
    $$strict: true
});

const checkDonate = validator.compile({
    donateAmount: { type: "number", positive: true, max: 100, convert: true }, //  настроить
    $$strict: true
});

//------------------------------------------------------------------------------

module.exports = {
    '@state': async ({ state }) => {
        state.users = {};
        const { tonweb } = connectTON();
        const { balance: balanceA, keyPair: keyPairA, wallet: walletA, walletAddress: walletAddressA } = await createWallet(tonweb, 'A', '1t58J2v6FaSuXFGcyGtqT5elpVxcZ+I1zgu/GUfA5uY=');
        const { balance: balanceB, keyPair: keyPairB, wallet: walletB, walletAddress: walletAddressB } = await createWallet(tonweb, 'B', '0t58J2v6FaSuXFGcyGtqT5elpVxcZ+I1zgu/GUfA5uY=');
        state.channel = {
            walletA: walletA,
            walletB: walletB,
            walletAddressA: walletAddressA,
            walletAddressB: walletAddressB,
            balanceA: balanceA,
            balanceB: balanceB,
            keyPairA: keyPairA,
            keyPairB: keyPairB,
            tonweb: tonweb,
            channelId: randomInteger(1000000, 9000000),
        }
    },

    info: async ({ state, user_id }) => {
        const info = {
            serverWallet: state.channel.walletAddressA.toString(true, true, true),
            userWallet: state.channel.walletAddressB.toString(true, true, true),
            balanceA: state.channel.balanceA,
            balanceB: state.channel.balanceB,

            OPERATIONS_TIMEOUT,
            TICK_COST,
            DEPLOY_FEE,
            TOP_UP_FEE,
            INIT_FEE,
            CLOSE_CHANNEL_FEE,
            STREAM_INTERVAL,
            STREAM_DURATION,
            QUESTION_COST,

            STATE: 'NOT_CONNECTED'
        }
        const user = state.users[user_id];
        if(user) {
            info.STATE = user.STATE;
            info.STREAM_STATE = user.STREAM_STATE;
            if(user.channelAddress) info.CHANNEL = user.channelAddress;
        }
        return info;
    },

    createChannel: async ({ payload, state, user_id, sendMessage }) => {
        if(state.users[user_id] && state.users[user_id].STATE !== 'NOT_CONNECTED') {
            sendMessage('log', `Channel ${state.channel.channelId} already created`);
            throw `Channel ${state.channel.channelId} already created`;
        }

        const valid = checkDeposit(payload);
        if(valid !== true) {
            sendMessage('log', { ERROR: 'Wrong deposit value' });
            throw 'Wrong deposit value';
        }

        const balance = await state.channel.tonweb.getBalance(state.channel.walletAddressA);
        if(payload.deposit > fromNano(balance)) {
            sendMessage('log', { ERROR: 'Not enouth balance' });
            throw 'Not enouth balance';
        }
        sendMessage('log', 'createChannel');

        createChannel({ payload, state, user_id, sendMessage });// без ожидания
    },

    resetChannel: async ({ payload, state, user_id, sendMessage }) => {
        sendMessage('log', 'resetChannel');
        if(state.users[user_id]) {
            state.users[user_id] = { STATE: 'NOT_CONNECTED' };
        }
        sendMessage('STATE', 'NOT_CONNECTED');
        sendMessage('STREAM_STATE', 'IDLE');
    },

    tick: async ({ payload, state, user_id, sendMessage }) => {
        const user = state.users[user_id];
        if(!user) throw 'No user';

        if(user.STREAM_STATE == 'STREAM_FINISHED') throw 'Stream in this channel is finished';
        if(user.STATE !== 'CHANNEL_READY') throw 'Cant stream. Channel not ready';

        //----------------------------------------------------------------------
        // FIRST OFFCHAIN TRANSFER - A sends 0.1 TON to B

        // A creates new state - subtracts 0.1 from A's balance, adds 0.1 to B's balance, increases A's seqno by 1


        if(!user.seqnoA) user.STREAM_STATE = 'STREAM_STARTED';

        user.seqnoA = !user.seqnoA ? 1 : user.seqnoA + 1;
        user.userBalance   = !user.userBalance                ? Number(user.deposit) : Math.round(user.userBalance * 1000   - TICK_COST * 1000) / 1000;
        user.serverBalance = user.serverBalance === undefined ? 0                    : Math.round(user.serverBalance * 1000 + TICK_COST * 1000) / 1000;

        sendMessage('log', `seqnoA: ${user.seqnoA} userBalance: ${user.userBalance} serverBalance: ${user.serverBalance}`);

        console.log(`seqnoA: ${user.seqnoA} userBalance: ${user.userBalance} serverBalance: ${user.serverBalance}`)

        //  здесь закрываемся, если баланс юзера меньше нуля TO-DO

        const channelState = {
            balanceA: toNano(String(user.userBalance)),
            balanceB: toNano(String(user.serverBalance)),
            seqnoA: new BN(user.seqnoA),
            seqnoB: new BN(0)
        };

        // A signs this state and send signed state to B (e.g. via websocket)

        const signatureA = await user.channelA.signState(channelState);
        // B checks that the state is changed according to the rules, signs this state, send signed state to A (e.g. via websocket)
        if (!(await user.channelB.verifyState(channelState, signatureA))) throw new Error('Invalid A signature');
        const signatureB = await user.channelB.signState(channelState);

        user.lastChannelState = channelState;

        if(user.userBalance <= 0) {
            sendMessage('log', `STREAM_FINISHED`);
            user.STREAM_STATE = 'STREAM_FINISHED';
            finalizeStream({ user, sendMessage });
        }
        return true;
    },

    startStream: async ({ payload, state, user_id, sendMessage }) => {
        const user = state.users[user_id];
        if(!user) throw 'No user';

        if(user.STREAM_STATE != 'IDLE') throw 'Stream in this channel is finished';
        //if(user.STATE !== 'CHANNEL_READY') throw 'Cant stream. Channel not ready';
        if(user.STATE !== 'CHANNEL_CONFIGURED') throw 'Cant stream. Channel not ready';

        startStream({ state, user, sendMessage });
        return true;
    },

    stopStream: async ({ payload, state, user_id, sendMessage }) => {
        const user = state.users[user_id];
        if(!user) throw 'No user';
        if(user.STREAM_STATE != 'STREAM_RUNNING') throw 'Stream not started';
        stopStream({ user, sendMessage });
        return true;
    },


    donate: async ({ payload, state, user_id, sendMessage }) => {
        const user = state.users[user_id];
        if(!user) throw 'No user';
        if(user.STREAM_STATE != 'STREAM_RUNNING') throw 'Stream not started';

        const valid = checkDonate(payload);
        if(valid !== true) {
            sendMessage('log', { ERROR: 'Wrong donate amount' });
            throw 'Wrong donate amount';
        }

        const donateAmount = payload.donateAmount;
        await donate({ user, sendMessage, donateAmount });
        return true;
    }
}

async function startStream({ state, user, sendMessage }) {
    sendMessage('log', 'Stream started');

    if(user.streamTimer) {
        console.log('Stream already started');
        sendMessage('log', 'Stream already started');
        return;
    }

    user.streamInterval = STREAM_INTERVAL;
    user.streamDuration = STREAM_DURATION;

    user.streamTick = 0;
    user.streamStartTime = new Date();
    user.streamTimer = setInterval(() => {
        user.streamTick++;
        streamTick({ user, tick: user.streamTick, sendMessage });
        if((new Date()) - user.streamStartTime >= user.streamDuration) stopStream({ user, sendMessage });
    }, user.streamInterval);
    user.STREAM_STATE = 'STREAM_RUNNING';
    sendMessage('STREAM_STATE', user.STREAM_STATE);
}

async function streamTick({ user, tick, sendMessage }) {
    await user2streamerTransaction({ user, sendMessage, value: TICK_COST });
}

async function donate({ user, sendMessage, donateAmount }) {
    const userBalance = !user.userBalance ? Number(user.deposit) : Math.round(user.userBalance * 1000 - donateAmount * 1000) / 1000;
    if(userBalance <= 0) throw 'Not enough tokens';
    sendMessage('log', `Donating ${donateAmount} tokens`);
    await user2streamerTransaction({ user, sendMessage, value: donateAmount });
}

async function user2streamerTransaction({ user, sendMessage, value }) {
    user.seqnoA         = !user.seqnoA ? 1 : user.seqnoA + 1;
    user.userBalance    = !user.userBalance                ? Number(user.deposit) : Math.round(user.userBalance * 1000   - value * 1000) / 1000;
    user.serverBalance  = user.serverBalance === undefined ? 0                    : Math.round(user.serverBalance * 1000 + value * 1000) / 1000;

    sendMessage('log', `${user.seqnoA} | ${user.userBalance} >>> ${user.serverBalance}`);

    console.log(`${user.seqnoA} | ${user.userBalance} >>> ${user.serverBalance}`)

    if(user.userBalance <= 0) stopStream({ user, sendMessage });

    const channelState = {
        balanceA: toNano(String(user.userBalance)),
        balanceB: toNano(String(user.serverBalance)),
        seqnoA: new BN(user.seqnoA),
        seqnoB: new BN(0)
    };

    // A signs this state and send signed state to B (e.g. via websocket)
    const signatureA = await user.channelA.signState(channelState);
    // B checks that the state is changed according to the rules, signs this state, send signed state to A (e.g. via websocket)
    if (!(await user.channelB.verifyState(channelState, signatureA))) throw new Error('Invalid A signature');
    const signatureB = await user.channelB.signState(channelState); //????? <============ ?????

    user.lastChannelState = channelState;
}

async function stopStream({ user, sendMessage }) {
    sendMessage('log', 'Stream finished');
    clearInterval(user.streamTimer);
    user.streamTimer = undefined;
    user.STREAM_STATE = 'STREAM_FINISHED';
    sendMessage('STREAM_STATE', user.STREAM_STATE);
    finalizeStream({ user, sendMessage });
}


async function finalizeStream({ user, sendMessage }) {
    //----------------------------------------------------------------------
    // CLOSE PAYMENT CHANNEL

    // The parties decide to end the transfer session.
    // If one of the parties disagrees or is not available, then the payment channel can be emergency terminated using the last signed state.
    // That is why the parties send signed states to each other off-chain.
    // But in our case, they do it by mutual agreement.

    // First B signs closing message with last state, B sends it to A (e.g. via websocket)

    const signatureClose = await user.channelB.signClose(user.lastChannelState);

    // A verifies and signs this closing message and include B's signature

    // A sends closing message to blockchain, payments channel smart contract
    // Payment channel smart contract will send funds to participants according to the balances of the sent state.

    if (!(await user.channelA.verifyClose(user.lastChannelState, signatureClose))) throw new Error('Invalid B signature');

    const closeResult = await user.fromWalletA.close({
        ...user.lastChannelState,
        hisSignature: signatureClose
    }).send(toNano(CLOSE_CHANNEL_FEE));

    sendMessage('log', 'Contract DONE :)' );

    console.log('closeResult'.yellow, closeResult);
    console.log('DONE'.red);
}

//------------------------------------------------------------------------------
async function createChannel({ payload, state, user_id, sendMessage }) {
    try {
        const deposit = String(payload.deposit);
        const user = state.users[user_id] = {
            STREAM_STATE: 'IDLE'
        };
        sendMessage('STREAM_STATE', user.STREAM_STATE);

        const setState = state => {
            user.STATE = state;
            sendMessage('STATE', state);
        }

        state.channel.channelId++;
        const { fromWalletA, fromWalletB, channelA, channelB, channelInitState, channelConfig, channelAddress } = await createChannelConfig({
            tonweb: state.channel.tonweb,
            walletA: state.channel.walletA,
            walletB: state.channel.walletB,
            walletAddressA: state.channel.walletAddressA,
            walletAddressB: state.channel.walletAddressB,
            keyPairA: state.channel.keyPairA,
            keyPairB: state.channel.keyPairB,
            channelId: state.channel.channelId ,
            deposit
        });
        user.channelAddress = channelAddress;
        user.channelId = state.channel.channelId;
        user.fromWalletA = fromWalletA;
        user.fromWalletB = fromWalletB;
        user.channelA = channelA;
        user.channelB = channelB;
        user.deposit = deposit;
        sendMessage('CHANNEL', channelAddress);

        sendMessage('log', `Channel ${state.channel.channelId} configured`);
        sendMessage('log', `channelAddress: ${channelAddress}`);
        setState('CHANNEL_CONFIGURED');

        return;

        sendMessage('log', 'Try to deploy payment channel ( < 30 sec)');
        await deployChannel({ fromWalletA, channelA, sendMessage });
        sendMessage('log', 'Channel deployed');
        setState('CHANNEL_DEPLOYED');

        sendMessage('log', 'Try to fund payment channel ( < 30 sec)');
        await topupChannel({ fromWalletA, fromWalletB, channelA, channelInitState, sendMessage });
        sendMessage('log', 'Payment channel funded');
        setState('CHANNEL_FUNDED');

        sendMessage('log', 'Try to init channel ( < 30 sec)');
        await initChannel({ fromWalletA, channelA, channelInitState, sendMessage })
        sendMessage('log', 'Payment channel ready to bussines');
        setState('CHANNEL_READY');
    } catch (error) {
        console.log(error);
        sendMessage('log', { ERROR: error });
    }
}

async function createChannelConfig({ tonweb, walletA, walletB, walletAddressA, walletAddressB, keyPairA, keyPairB, channelId, deposit}) {
    const channelInitState = {
        balanceA: toNano(deposit), // A's initial balance in Toncoins. Next A will need to make a top-up for this amount
        balanceB: toNano('0'), // B's initial balance in Toncoins. Next B will need to make a top-up for this amount
        seqnoA: new BN(0), // initially 0
        seqnoB: new BN(0)  // initially 0
    };

    const channelConfig = {
        channelId: new BN(channelId), // Channel ID, for each new channel there must be a new ID
        addressA: walletAddressA, // A's funds will be withdrawn to this wallet address after the channel is closed
        addressB: walletAddressB, // B's funds will be withdrawn to this wallet address after the channel is closed
        initBalanceA: channelInitState.balanceA,
        initBalanceB: channelInitState.balanceB
    }

    // Each on their side creates a payment channel object with this configuration

    const channelA = tonweb.payments.createChannel({ ...channelConfig, isA: true, myKeyPair: keyPairA, hisPublicKey: keyPairB.publicKey });
    const channelB = tonweb.payments.createChannel({ ...channelConfig, isA: false, myKeyPair: keyPairB, hisPublicKey: keyPairA.publicKey });

    const channelAddress = await channelA.getAddress(); // address of this payment channel smart-contract in blockchain
    if ((await channelB.getAddress()).toString() !== channelAddress.toString()) throw new Error('Channels address not same');

    // Interaction with the smart contract of the payment channel is carried out by sending messages from the wallet to it.
    // So let's create helpers for such sends.

    const fromWalletA = channelA.fromWallet({ wallet: walletA, secretKey: keyPairA.secretKey });
    const fromWalletB = channelB.fromWallet({ wallet: walletB, secretKey: keyPairB.secretKey });

    return {
        channelInitState,
        channelConfig,
        channelA,
        channelB,
        fromWalletA,
        fromWalletB,
        channelAddress: channelAddress.toString(true, true, true)
    }
}

async function deployChannel({ fromWalletA, channelA, sendMessage }) {
    //----------------------------------------------------------------------
    // NOTE:
    // Further we will interact with the blockchain.
    // After each interaction with the blockchain, we need to wait for execution. In the TON blockchain, this is usually about 5 seconds.
    // In this example, the interaction code happens right after each other - that won't work.
    // To study the example, you can put a `return` after each send.
    // In a real application, you will need to check that the smart contract of the channel has changed
    // (for example, by calling its get-method and checking the `state`) and only then do the following action.

    //----------------------------------------------------------------------
    // DEPLOY PAYMENT CHANNEL FROM WALLET A

    // Wallet A must have a balance.
    // 0.05 TON is the amount to execute this transaction on the blockchain. The unused portion will be returned.
    // After this action, a smart contract of our payment channel will be created in the blockchain.
    sendMessage('log', `...`);

    const result = await fromWalletA.deploy().send(toNano(DEPLOY_FEE));
    console.log('Channel deploy result'.yellow, result);

    const done = await tryRequest(async (count) => {
        sendMessage('log_freeze', `Awaiting channel deploy ${OPERATIONS_TIMEOUT-count} sec`);
        console.log('Channel state: ', await channelA.getChannelState());
    }, { retryCount: OPERATIONS_TIMEOUT });
    if(!done) throw 'Can`t deploy channel';
}

async function topupChannel({ fromWalletA, fromWalletB, channelA, channelInitState, sendMessage }) {
    // TOP UP
    // Now each parties must send their initial balance from the wallet to the channel contract.

    sendMessage('log', `Funding ${fromNano(channelInitState.balanceA.add(toNano(TOP_UP_FEE)))} to user balance`);
    sendMessage('log', `Funding ${fromNano(channelInitState.balanceB.add(toNano(TOP_UP_FEE)))} to server balance`);
    sendMessage('log', `...`);

    const fromWalletAresult = await fromWalletA
        .topUp({coinsA: channelInitState.balanceA, coinsB: new BN(0)})
        .send(channelInitState.balanceA.add(toNano(TOP_UP_FEE))); // +0.05 TON to network fees

    const fromWalletBresult = await fromWalletB
        .topUp({coinsA: new BN(0), coinsB: channelInitState.balanceB})
        .send(channelInitState.balanceB.add(toNano(TOP_UP_FEE))); // +0.05 TON to network fees

    console.log('fromWalletAresult = ', fromWalletAresult);
    console.log('fromWalletBresult = ', fromWalletBresult);

    // to check, call the get method - the balances should change
    const done = await tryRequest(async (count) => {
        sendMessage('log_freeze', `Awaiting balance change ${OPERATIONS_TIMEOUT-count} sec`);
        const data = await channelA.getData();
        console.log('balanceA = ', fromNano(data.balanceA).green, ' balanceB = ', fromNano(data.balanceB).green);
        if(data.balanceA.toString() == '0') throw false;
    }, { retryCount: OPERATIONS_TIMEOUT });
    if(!done) throw 'Can`t fund channel';
}

async function initChannel({ fromWalletA, channelA, channelInitState, sendMessage }) {
    sendMessage('log', `...`);
    const initResult = await fromWalletA.init(channelInitState).send(toNano(INIT_FEE));
    console.log('initResult'.yellow, initResult);
    // to check, call the get method - `state` should change to `TonWeb.payments.PaymentChannel.STATE_OPEN`
    const done = await tryRequest(async (count) => {
        sendMessage('log_freeze', `Awaiting init payment channel ${OPERATIONS_TIMEOUT-count} sec`);
        const state = await channelA.getChannelState();
        console.log('Channel state: ', state);
        if(state != 1) throw false;
    }, { retryCount: OPERATIONS_TIMEOUT });
    if(!done) throw 'Can`t init channel';
}








//==============================================================================
module.exports = createEndpoints(module.exports);
