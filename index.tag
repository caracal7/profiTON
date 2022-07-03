<i-js @window src='/tags/window'></i-js>
<i-js @address src='/tags/address'></i-js>

<script template>

    <@window caption="User state" left='10px' top='10px' width='310px' height='370px' overflow='auto'>
        <h4>User balance: ${state.balanceA}</h4>
        <h4>CHANNEL_STATE: ${state.STATE}</h4>
        <h4>STREAM_STATE: ${state.STREAM_STATE}</h4>
        <h4 if(state.CHANNEL)>Payment channel: <@address address=state.CHANNEL></@address></h4>

        Сколько морозим: <input type="text" %value=state.deposit>
        <br>
        <input type="range" %value=state.deposit min=0.1 max=10 step=0.1>
        <br>
        <button @click=createChannel disabled=(state.STATE != 'NOT_CONNECTED')>createChannel</button>
        <button @click=resetChannel style="background:red">resetChannel</button>
        <button @click(e=> state.logs = []) style="background:#9888fb" disabled=(!state.logs.length)>clearLogs</button>
    </@window>

    <@window caption="Settings" left='835px' top='10px' width='220px' height='250px'>
        <table cellpadding=2 cellspacing=1 class="settings">
        <tr for(item in ['OPERATIONS_TIMEOUT', 'DEPLOY_FEE', 'TOP_UP_FEE', 'INIT_FEE', 'CLOSE_CHANNEL_FEE', 'STREAM_INTERVAL', 'STREAM_DURATION', 'TICK_COST', 'QUESTION_COST'])>
            <td>${item}:</td><td><b>${state[item]}</b></td>
        </tr>
        </table>
    </@window>

    <@window caption="Parties" left='10px' top='415px' width='310px' height='85px'>
        <table cellpadding=5 cellspacing=1>
        <tr>
            <td>User balance:</td>
            <td><b>${state.balanceA}</b></td>
            <td><@address address=state.userWallet></@address></td>
        </tr>
        <tr>
            <td>Streamer balance:</td>
            <td><b>${state.balanceB}</b></td>
            <td><@address address=state.serverWallet></@address></td>
        </tr>
        </table>
    </@window>

    <@window caption="Server logs" left='330px' top='10px' width='500px' height='400px' overflow='auto'>
        <table cellspacing=3 cellpadding=3 class="logs">
            <tr for(log in state.logs)>
                <td>${log.num}<br>${moment(log.date).format("HH:mm:ss")}</td>
                <td class=log.error>${typeof log.message === 'string' ? log.message : JSON.stringify(log.message)}</td>
            </tr>
        </table>
    </@window>


    <@window if(state.STATE == 'CHANNEL_CONFIGURED') caption="Stream" left='220px' top='100px' width='800px' height='600px' overflow='auto'>

        <table cellspacing=3 cellpadding=3 width='100%'>
            <tr>
                <td valign="top" width='400px'>
                    <div style="width:400px;height:230px">
                        <video if(state.STREAM_STATE == 'STREAM_RUNNING') id='video' width="400" height="230" controls="controls" autoplay='autoplay'>
                            <source src="https://media.w3.org/2010/05/sintel/trailer.mp4" type="video/mp4">
                        </video>
                    </div>
                    <br>

                    <button @click=startStream disabled=(state.STREAM_STATE != 'IDLE')>startStream</button>
                    <button @click=stopStream style="background:red" disabled=(state.STREAM_STATE != 'STREAM_RUNNING')>stopStream</button>

                    <hr>
                    <input type="range" %value=state.donateAmount min=0.1 max=10 step=0.1 disabled=(state.STREAM_STATE != 'STREAM_RUNNING')><br>
                    <button @click=Donate style="background:#23939a" disabled=(state.STREAM_STATE != 'STREAM_RUNNING')>Donate ${state.donateAmount} tokens</button>

                </td>
                <td valign="top">
                    <div>
                        <h3>Questions</h3>

                        <table cellspacing=3 cellpadding=3 class="logs">
                            <tr for(q in state.questions)>
                                <td>${q.num}<br>${moment(q.date).format("HH:mm:ss")}</td>
                                <td>
                                    ${q.question} <i if(!q.answered)>(-${state.QUESTION_COST} tokens holded)</i>
                                    <div class="answered" if(q.answered)>Was answered by streamer <i>(-${state.QUESTION_COST} tokens payed to streamer)</i></div>
                                </td>
                            </tr>
                        </table>

                        <input type="text" %value=state.questionText>
                        <button @click=askQuestion style="background:#23939a" disabled=(!state.questionText.trim().length)>Ask for ${state.QUESTION_COST} tokens</button>

                    </div>
                </td>
            </tr>
        </table>






    </@window>
</script>

<script state>
    OPERATIONS_TIMEOUT:'',
    TICK_COST:'',
    DEPLOY_FEE:'',
    TOP_UP_FEE:'',
    INIT_FEE:'',
    CLOSE_CHANNEL_FEE:'',
    STREAM_INTERVAL:'',
    STREAM_DURATION:'',
    QUESTION_COST: '',

    logs: [],
    log_num: 1,

    serverWallet: '',
    userWallet: '',
    balanceA: '',
    balanceB: '',

    deposit: 2.7,
    CHANNEL: '',

    STATE: 'NOT_CONNECTED',
    STREAM_STATE: 'IDLE',

    donateAmount: 0.1,

    questions: [],
    questionText: '',
    questionNum: 1,



</script>

<script>
    async connected() {
        try {
            const response = await $.RPC('public/pages/TON#TON/info', {});
            const state = {
                serverWallet: response.serverWallet,
                userWallet: response.userWallet,
                balanceA: response.balanceA,
                balanceB: response.balanceB,
                OPERATIONS_TIMEOUT: response.OPERATIONS_TIMEOUT,
                TICK_COST: response.TICK_COST,
                DEPLOY_FEE: response.DEPLOY_FEE,
                TOP_UP_FEE: response.TOP_UP_FEE,
                INIT_FEE: response.INIT_FEE,
                CLOSE_CHANNEL_FEE: response.CLOSE_CHANNEL_FEE,
                STREAM_INTERVAL: response.STREAM_INTERVAL,
                STREAM_DURATION: response.STREAM_DURATION,
                QUESTION_COST: response.QUESTION_COST,
            }
            if(response.CHANNEL) state.CHANNEL = response.CHANNEL;
            if(response.STATE) state.STATE = response.STATE;
            if(response.STREAM_STATE) state.STREAM_STATE = response.STREAM_STATE;

            this.render(state);
            //console.log(response)
        } catch (e) {
            console.log(e)
        }

        this.subscribe('log', ({ topic, message }) => this.Log(message));
        this.subscribe('log_freeze', ({ topic, message }) => {
            const item = { date: new Date(), message, num: this.state.log_num };
            if(!this.state.logs.length)
                this.state.logs.push(item);
            else
                this.state.logs[0] = item;
            this.state.log_num++;
            this.render();
        });
        this.subscribe('STATE', ({ message }) => {
            const state = { STATE: message };
            if(message === 'NOT_CONNECTED') state.CHANNEL = undefined;
            this.render(state);
        });
        this.subscribe('CHANNEL', ({ message }) => {
            this.render({ CHANNEL: message });
        });
        this.subscribe('STREAM_STATE', ({ message }) => {
            this.render({ STREAM_STATE: message });
        });
    }

    Log(message) {
        const item = { date: new Date(), message, num: this.state.log_num };
        if(typeof message == 'object' && message.ERROR) {
            item.error = 'error';
            item.message = message.ERROR;
        }
        this.state.logs.unshift(item);
        this.state.log_num++;
        this.render();
    }

    async createChannel() {
        try {
            const response = await $.RPC('public/pages/TON#TON/createChannel', {
                deposit: this.state.deposit
            });
            //console.log(response)
        } catch (e) {
            console.log(e)
        }
    }

    async resetChannel() {
        try {
            const response = await $.RPC('public/pages/TON#TON/resetChannel', {});
        } catch (e) {
            console.log(e)
        }
    }

    async startStream() {
        this.state.questions = [];
        this.state.questionNum = 1;
        this.render();
        try {
            const response = await $.RPC('public/pages/TON#TON/startStream', { });
            this.render();
        } catch (e) {
            this.Log({ ERROR: e });
        }
    }

    async stopStream() {
        this.render();
        try {
            const response = await $.RPC('public/pages/TON#TON/stopStream', { });
        } catch (e) {
            this.Log({ ERROR: e });
        }
    }

    async Donate() {
        try {
            const response = await $.RPC('public/pages/TON#TON/donate', { donateAmount: this.state.donateAmount });
        } catch (e) {
            this.Log({ ERROR: e });
        }
    }

    async askQuestion() {
        const question = this.state.questionText.trim().endsWith('?') ? this.state.questionText.trim() : this.state.questionText.trim()+'?';
        const item = { date: new Date(), question, num: this.state.questionNum, answered: Math.random() > 0.5 };
        this.state.questions.push(item);
        this.state.questionNum++;
        this.state.questionText = '';
        this.render();
    }


</script>

<style src='/css/button.css'></style>

<style>
    .answered {
        color: #2fa47a;
    }
    .settings tr:nth-child(even){
        background-color: #e0ecff;
    }
    .settings, .logs {
        min-width: 100%;
    }
    .settings td:first-child{
        text-align: right;
    }

    .logs td:first-child{
        font-size:7px;
    }
    .logs tr:nth-child(even){
        background-color: #e0ecff;
    }

    .error {
        font-weight: bold;
        color: red;
    }

    .green {
        color: green;
    }
</style>
