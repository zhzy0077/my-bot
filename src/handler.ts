import { Octokit } from "@octokit/rest";
import { Secrets } from "./secrets";

const HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Accept": "application/json",
}

const octokit = new Octokit({
  auth: Secrets.GIST_TOKEN,
});

const AccessTokenFile = "access_token";

export async function handleRequest(request: Request): Promise<Response> {
  try {
    const accessToken = await getAccessToken();
    const result = await sendMessage(await request.text(), accessToken);
    await log(JSON.stringify(result));
    return new Response(JSON.stringify(result));
  } catch (err) {
    await log(JSON.stringify(err));
    return new Response(err.stack || err)
  }
}

async function getAccessToken(): Promise<string> {
  const cacheToken = await readAccessTokenFromCache();
  if (now() < cacheToken.expires_at) {
    return cacheToken.access_token;
  }
  const latestToken = await fetchAccessTokenFromOrigin();
  await updateAccessTokenCache(latestToken);
  return latestToken.access_token;
}

async function readAccessTokenFromCache(): Promise<WeChatAccessToken> {
  const { data } = await octokit.gists.get({
    gist_id: Secrets.GIST_ID,
  });
  const content = (data.files as any)[AccessTokenFile].content;
  return JSON.parse(content) as WeChatAccessToken;
}

async function updateAccessTokenCache(token: WeChatAccessToken): Promise<void> {
  await octokit.gists.update({
    gist_id: Secrets.GIST_ID,
    files: {
      [AccessTokenFile]: {
        content: JSON.stringify(token),
      }
    } as any
  });
}

async function log(log: string): Promise<void> {
  await octokit.gists.createComment({
    gist_id: Secrets.GIST_ID,
    body: log,
  });
}

async function fetchAccessTokenFromOrigin(): Promise<WeChatAccessToken> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${Secrets.WX_APPID}&secret=${Secrets.WX_APPSECRET}`;
  const result = await fetchTyped<WeChatAccessToken>(url);
  result.expires_at = now() + result.expires_in;
  return result;
}

async function sendMessage(message: string, accessToken: string): Promise<WeChatSendMessageReply> {
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  const wxMessage: WeChatMessage = {
    touser: "org6fvzbNIm5TlJTCShbKFyd59UA",
    msgtype: "text",
    text:
    {
      content: message,
    },
  };
  return await fetchTyped<WeChatSendMessageReply>(url, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(wxMessage)
  });
}

async function fetchTyped<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  return response.json() as Promise<T>;
}

function now(): number {
  return new Date().getTime() / 1000
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