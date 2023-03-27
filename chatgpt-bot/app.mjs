import { WebClient } from '@slack/web-api';
import { Configuration, OpenAIApi } from 'openai';

const slackClient  = new WebClient(process.env.SLACK_BOT_TOKEN);
const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);


export const handler = async (event, context) => {
    if (event.headers['x-slack-retry-num']) {
        return { statusCode: 200, body: JSON.stringify({ message: 'No need to resend' }) };
    }

    const body = JSON.parse(event.body);
    const text = body.event.text.replace(/<@.*>/g, '');

    const thread_ts = body.event.thread_ts || body.event.ts;


    const replies = await slackClient.conversations.replies({
        token: process.env.SLACK_BOT_TOKEN,
        channel: body.event.channel,
        ts: thread_ts,
        // inclusive: true
    })
    
    const messageInput = await createMessageInput(replies['messages'])
    
    console.log(messageInput)
    
    const [channel,ts] = await postMessage(body.event.channel, thread_ts, "考え中。。");
    const openaiResponse = await createCompletion(text,messageInput);
    // await postMessage(body.event.channel, thread_ts, "考え終わり");
    await deleteMessage(channel,ts)
    await postMessage(body.event.channel, thread_ts, openaiResponse);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

async function createMessageInput(message) {
    let messageList = [];
    for (const element of message) {
        // console.log(element)
        if(element['user']=='U04VBNS9XT9'){
            // console.log('bot')
            messageList.push({"role": "assistant", "content":element["text"]})
        }else if(element["text"].indexOf("U04VBNS9XT9") !== -1){
            // console.log('user')
            messageList.push({"role": "user", "content":element["text"].replace("<@U04VBNS9XT9>","")})
        }
    }
    return messageList
}

async function createCompletion(text,messageInput) {
    try {
        const response = await openaiClient.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: messageInput,
        });
        return response.data.choices[0].message?.content;
    } catch(err) {
        console.error(err);
    }
}

async function deleteMessage(channel, thread_ts) {
    try {
        let payload = {
            channel: channel,
            ts: thread_ts,
        };
        const res = await slackClient.chat.delete(payload);
        return [res['channel'],res['ts']]
    } catch(err) {
        console.error(err);
    }
}

async function postMessage(channel, thread_ts, text) {
    try {
        let payload = {
            channel: channel,
            thread_ts: thread_ts,
            text: text,
            as_user: true,
        };
        const res = await slackClient.chat.postMessage(payload);
        return [res['channel'],res['ts']]
    } catch(err) {
        console.error(err);
    }
}