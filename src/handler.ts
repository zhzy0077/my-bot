import { Secrets } from "./secrets";

export async function handleRequest(request: Request): Promise<Response> {
  const accessToken = await fetchAccessToken();
  const success = await sendMessage(await request.text(), accessToken);
  return new Response(success.toString());
}

async function fetchAccessToken(): Promise<string> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${Secrets.WX_APPID}&secret=${Secrets.WX_APPSECRET}`;
  const result = await fetch(url);
  return (await result.json())["access_token"];
}

async function sendMessage(message: string, accessToken: string): Promise<boolean> {
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "touser": "org6fvzbNIm5TlJTCShbKFyd59UA",
      "msgtype": "text",
      "text":
      {
        "content": message
      }
    })
  });
  return (await response.json())["errcode"] === 0;
}