import { WebClient } from '@slack/web-api';
import { Configuration, OpenAIApi } from 'openai';

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);

export const handler = async (event, context) => {
    if (event.headers['x-slack-retry-num']) {
        return { statusCode: 200, body: JSON.stringify({ message: 'No need to resend' }) };
    }
    const body = JSON.parse(event.body);
    const thread_ts = body.event.thread_ts || body.event.ts;
    const channel = body.event.channel;
    const replies = await slackClient.conversations.replies({
        token: process.env.SLACK_BOT_TOKEN,
        channel: channel,
        ts: thread_ts,
        // inclusive: true
    });
    const messageInput = await createMessageInput(replies['messages']);
    console.log(messageInput);
    const [posted_channel, ts] = await postMessage(channel, thread_ts, "[SYSTEM] 考え中。。");
    const openaiResponse = await createCompletion(messageInput, channel, thread_ts);
    await deleteMessage(posted_channel, ts);
    await postMessage(channel, thread_ts, openaiResponse);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

async function createMessageInput(message, channel, thread_ts) {
    try {
        let messageList = [];
        // create list from reversed list
        for (const element of message.reverse()) {
            if (messageList.length > 15) break;
            if (element['user'] == 'U04VBNS9XT9') {
                messageList.unshift({ "role": "assistant", "content": element["text"] });
            } else if (element["text"].indexOf("U04VBNS9XT9") !== -1) {
                messageList.unshift({ "role": "user", "content": element["text"].replace("<@U04VBNS9XT9>", "") });
            }
        }
        return messageList;

    } catch (err) {
        postMessage(channel, thread_ts, "[SYSTEM] Input加工中にエラーが発生しました");
        console.error(err);
    }
}

async function createCompletion(messageInput, channel, thread_ts) {
    try {
        const response = await openaiClient.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: messageInput,
        });
        return response.data.choices[0].message?.content;
    } catch (err) {
        postMessage(channel, thread_ts, "[SYSTEM] ChatGPT処理中ににエラーが発生しました");
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
        return [res['channel'], res['ts']];
    } catch (err) {
        postMessage(channel, thread_ts, "[SYSTEM] メッセージ削除中にエラーが発生しました");
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
        return [res['channel'], res['ts']];
    } catch (err) {
        console.error(err);
    }
}