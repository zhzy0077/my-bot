import { Octokit } from "@octokit/rest";
import { Secrets } from "./secrets";

const HEADERS: HeadersInit = {
  "Content-Type": "application/json"
};

const octokit = new Octokit({
  auth: Secrets.GIST_TOKEN
});

enum MessageChannel {
  WeChat,
  Telegram,
  Email
}

const accessTokenFile = "access_token";
const emailEvent = "email";
const toUser = "org6fvzbNIm5TlJTCShbKFyd59UA";
const chatId = "671943457";

const channelOrder = [
  MessageChannel.Telegram,
  MessageChannel.WeChat,
  MessageChannel.Email
];

const channelSenderMap = {
  [MessageChannel.Telegram]: sendTelegramMessage,
  [MessageChannel.WeChat]: sendWeChatMessage,
  [MessageChannel.Email]: sendEmail
};

const blockList: string[] = ["【芽芽的窝】", "【欧莱雅男士】", "【自如网】"];

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Alive");
  }
  const message: Message = await request.json();
  const context = await getContext();
  let messageLog: MessageLog = <MessageLog>{
    timestamp: now(),
    title: message.title,
    message: message.content,
    resultMsg: [] as string[]
  };
  try {
    precheckMessage(message, context);
    for (const channel of channelOrder) {
      const result = await sendMessage(channel, message, context);
      messageLog.resultMsg.push(JSON.stringify(result));
      if (result.success) {
        messageLog.status = MessageStatus.POSTED;
        return new Response(JSON.stringify(messageLog));
      }
    }
    messageLog.status = MessageStatus.FAILED;
  } catch (err) {
    messageLog.resultMsg.push(JSON.stringify(err));
    messageLog.status = MessageStatus.FAILED;
  } finally {
    log(messageLog, context);
    await saveContext(context);
  }
  return new Response(JSON.stringify(messageLog));
}

async function getContext(): Promise<Context> {
  const context = await readContext();
  if (now() >= context.weChatAccessToken.expires_at) {
    context.weChatAccessToken = await fetchAccessTokenFromOrigin();
  }

  return context;
}

async function readContext(): Promise<Context> {
  const { data } = await octokit.gists.get({
    gist_id: Secrets.GIST_ID
  });
  const accessToken = (data.files as any)[accessTokenFile];
  const logUrl = (data.files as any)[today()];
  let logContent = logUrl?.raw_url
    ? await fetchTyped<MessageLog[]>(logUrl?.raw_url)
    : [];
  return <Context>{
    weChatAccessToken: JSON.parse(accessToken.content) as WeChatAccessToken,
    log: logContent
  };
}

async function saveContext(context: Context): Promise<void> {
  await octokit.gists.update({
    gist_id: Secrets.GIST_ID,
    files: {
      [accessTokenFile]: {
        content: JSON.stringify(context.weChatAccessToken)
      },
      [today()]: {
        content: JSON.stringify(context.log)
      }
    } as any
  });
}

function log(log: MessageLog, context: Context): void {
  context.log.push(log);
}

async function fetchAccessTokenFromOrigin(): Promise<WeChatAccessToken> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${Secrets.WX_APPID}&secret=${Secrets.WX_APPSECRET}`;
  const result = await fetchTyped<WeChatAccessToken>(url);
  result.expires_at = now() + result.expires_in;
  return result;
}

function precheckMessage(message: Message, context: Context): void {
  // Step 1: check block list.
  for (let word of blockList) {
    if (message.content.indexOf(word) !== -1) {
      throw <MessageBlocked>{
        reason: `Block ${word} matches.`
      };
    }
  }

  // Step 2: check duplicate.
  const latest = context.log[context.log.length - 1];
  if (now() - latest.timestamp < 60 && message.content === latest.message) {
    throw <MessageBlocked>{
      reason: `A duplicate message found. The first one posted at ${latest.timestamp}.`
    };
  }
}

async function sendMessage(
  channel: MessageChannel,
  message: Message,
  context: Context
): Promise<SendMessageReply> {
  const sender = channelSenderMap[channel];
  return await sender(message.title, message.content, context);
}

async function sendEmail(
  title: string,
  message: string,
  context: Context
): Promise<SendMessageReply> {
  const url = `https://maker.ifttt.com/trigger/${emailEvent}/with/key/${Secrets.IFTTT_KEY}`;
  const emailMessage = {
    value1: title,
    value2: message
  };
  const response = await fetch(url, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(emailMessage)
  });
  return <SendMessageReply>{
    success: response.status == 200,
    errCode: response.status,
    errMsg: await response.text()
  };
}

async function sendWeChatMessage(
  title: string,
  message: string,
  context: Context
): Promise<SendMessageReply> {
  const accessToken = context.weChatAccessToken.access_token;
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  const wxMessage: WeChatMessage = {
    touser: toUser,
    msgtype: "text",
    text: {
      content: `${title}\n${message}`
    }
  };
  const result = await fetchTyped<WeChatSendMessageReply>(url, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(wxMessage)
  });
  return <SendMessageReply>{
    success: result.errcode == 0,
    errCode: result.errcode,
    errMsg: result.errmsg
  };
}

async function sendTelegramMessage(
  title: string,
  message: string,
  context: Context
): Promise<SendMessageReply> {
  const url = `https://api.telegram.org/bot${Secrets.TELEGRAM_AUTHENTICATION_TOKEN}/sendMessage`;
  const tgMessage: TelegramMessage = {
    chat_id: chatId,
    text: `${title}\n${message}`
  };
  const result = await fetchTyped<TelegramSendMessageReply>(url, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(tgMessage)
  });
  return <SendMessageReply>{
    success: result.ok,
    errCode: result.error_code,
    errMsg: result.description
  };
}

async function fetchTyped<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  return (await response.json()) as Promise<T>;
}

function now(): number {
  return Math.round(new Date().getTime() / 1000);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Context {
  weChatAccessToken: WeChatAccessToken;
  log: MessageLog[];
}

interface WeChatAccessToken {
  access_token: string;
  expires_in: number;
  expires_at: number;
}

interface Message {
  title: string;
  content: string;
}

interface WeChatMessage {
  touser: string;
  msgtype: string;
  text: {
    content: string;
  };
}

interface WeChatSendMessageReply {
  errcode: number;
  errmsg: string;
}

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: string;
}

interface TelegramSendMessageReply {
  ok: boolean;
  error_code: number;
  description: string;
  result: {
    message_id: number;
    date: number;
    text: string;
  };
}

interface SendMessageReply {
  errCode: number;
  errMsg: string;
  success: boolean;
}

interface MessageLog {
  title: string;
  message: string;
  timestamp: number;
  resultMsg: string[];
  status: MessageStatus;
}

interface MessageBlocked {
  reason: string;
}

enum MessageStatus {
  POSTED,
  FAILED
}
