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
]

export async function handleRequest (request: Request): Promise<Response> {
  const message = await request.text()
  const context = await getContext()
  try {
    if (!precheckMessage(message, context)) {
      await log(`Message: {${message}. Blocked.`, context)
      return new Response()
    }
    const result = await sendMessage(message, context)
    await log(`Message: {${message} Response: {${JSON.stringify(result)}}`, context)
    return new Response(JSON.stringify(result))
  } catch (err) {
    const errorMsg = JSON.stringify(err)
    await fallback(errorMsg, message)
    await log(errorMsg, context)
    return new Response(errorMsg)
  } finally {
    await saveContext(context)
  }
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
  return <Context>{
    weChatAccessToken: JSON.parse(accessToken.content) as WeChatAccessToken,
    logUrl: logUrl?.raw_url as string,
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
  let logContent = context.newLog
  if (context.logUrl) {
    logContent = await (await fetch(context.logUrl)).text() + logContent
  }

  await octokit.gists.update({
    gist_id: Secrets.GIST_ID,
    files: {
      [AccessTokenFile]: {
        content: JSON.stringify(context.weChatAccessToken),
      },
      [today()]: {
        content: logContent,
      }
    } as any
  })
}

async function log (log: string, context: Context): Promise<void> {
  context.newLog += `${log}\n`
}

async function fetchAccessTokenFromOrigin (): Promise<WeChatAccessToken> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${Secrets.WX_APPID}&secret=${Secrets.WX_APPSECRET}`
  const result = await fetchTyped<WeChatAccessToken>(url)
  result.expires_at = now() + result.expires_in
  return result
}

function precheckMessage (message: string, context: Context): boolean {
  for (let word of blockList) {
    if (message.indexOf(word) !== -1) {
      return false
    }
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
  return await fetchTyped<WeChatSendMessageReply>(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(wxMessage)
  })
}

async function fetchTyped<T> (input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  return await response.json() as Promise<T>
}

function now (): number {
  return new Date().getTime() / 1000
}

function today (): string {
  return new Date().toISOString().slice(0, 10)
}

interface Context {
  weChatAccessToken: WeChatAccessToken,
  logUrl: string,
  newLog: string,
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

