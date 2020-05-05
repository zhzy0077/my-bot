import { Octokit } from '@octokit/rest'
import { Secrets } from './secrets'

const HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
}

const octokit = new Octokit({
  auth: Secrets.GIST_TOKEN,
})

const AccessTokenFile = 'access_token'
const FallbackEvent = 'fallback'
const toUser = 'org6fvzbNIm5TlJTCShbKFyd59UA'

const blockList: string[] = [
  '【芽芽的窝】',
  '【欧莱雅男士】',
  '【自如网】',
]

export async function handleRequest (request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response("Alive")
  }
  const message = await request.text()
  const context = await getContext()
  let messageLog: MessageLog = <MessageLog> {
    timestamp: now(),
    message: message,
  }
  try {
    if (!precheckMessage(message, context)) {
      messageLog.status = MessageStatus.BLOCKED
      return new Response(JSON.stringify(messageLog))
    }
    const result = await sendMessage(message, context)
    messageLog.status = MessageStatus.POSTED
    messageLog.resultMsg = JSON.stringify(result);
  } catch (err) {
    const errorMsg = JSON.stringify(err)
    await fallback(errorMsg, message)

    messageLog.resultMsg = errorMsg
    messageLog.status = MessageStatus.FALLBACK
  } finally {
    log(messageLog, context)
    await saveContext(context)
  }
  return new Response(JSON.stringify(messageLog))
}

async function getContext (): Promise<Context> {
  const context = await readContext()
  if (now() >= context.weChatAccessToken.expires_at) {
    context.weChatAccessToken = await fetchAccessTokenFromOrigin()
  }

  return context
}

async function readContext (): Promise<Context> {
  const { data } = await octokit.gists.get({
    gist_id: Secrets.GIST_ID,
  })
  const accessToken = (data.files as any)[AccessTokenFile]
  const logUrl = (data.files as any)[today()]
  let logContent
  if (logUrl?.raw_url) {
    logContent = await fetchTyped<MessageLog[]>(logUrl?.raw_url)
  }
  return <Context>{
    weChatAccessToken: JSON.parse(accessToken.content) as WeChatAccessToken,
    log: logContent,
  }
}

async function fallback (errMsg: string, message: string): Promise<void> {
  const url = `https://maker.ifttt.com/trigger/${FallbackEvent}/with/key/${Secrets.IFTTT_KEY}`
  const fallbackMsg = {
    value1: message,
    value2: errMsg,
  }
  await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(fallbackMsg)
  })
}

async function saveContext (context: Context): Promise<void> {
  await octokit.gists.update({
    gist_id: Secrets.GIST_ID,
    files: {
      [AccessTokenFile]: {
        content: JSON.stringify(context.weChatAccessToken),
      },
      [today()]: {
        content: JSON.stringify(context.log),
      }
    } as any
  })
}

function log (log: MessageLog, context: Context): void {
  context.log.push(log)
}

async function fetchAccessTokenFromOrigin (): Promise<WeChatAccessToken> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${Secrets.WX_APPID}&secret=${Secrets.WX_APPSECRET}`
  const result = await fetchTyped<WeChatAccessToken>(url)
  result.expires_at = now() + result.expires_in
  return result
}

function precheckMessage (message: string, context: Context): boolean {
  // Step 1: check block list.
  for (let word of blockList) {
    if (message.indexOf(word) !== -1) {
      return false
    }
  }

  // Step 2: check duplicate.
  const latest = context.log[context.log.length - 1]
  if (now() - latest.timestamp < 60 && message === latest.message) {
    return false;
  }

  return true
}

async function sendMessage (message: string, context: Context): Promise<WeChatSendMessageReply> {
  const accessToken = context.weChatAccessToken.access_token
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`
  const wxMessage: WeChatMessage = {
    touser: toUser,
    msgtype: 'text',
    text:
      {
        content: message,
      },
  }
  const result = await fetchTyped<WeChatSendMessageReply>(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(wxMessage)
  })
  if (result.errcode !== 0) {
    throw result;
  }
  return result;
}

async function fetchTyped<T> (input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  return await response.json() as Promise<T>
}

function now (): number {
  return Math.round(new Date().getTime() / 1000)
}

function today (): string {
  return new Date().toISOString().slice(0, 10)
}

interface Context {
  weChatAccessToken: WeChatAccessToken,
  log: MessageLog[],
}

interface WeChatAccessToken {
  access_token: string,
  expires_in: number,
  expires_at: number,
}

interface WeChatMessage {
  touser: string,
  msgtype: string,
  text: {
    content: string,
  },
}

interface WeChatSendMessageReply {
  errcode: number,
  errmsg: string,
}

interface MessageLog {
  message: string,
  timestamp: number,
  status: MessageStatus,
  resultMsg: string,
}

enum MessageStatus {
  POSTED,
  BLOCKED,
  FALLBACK,
}
