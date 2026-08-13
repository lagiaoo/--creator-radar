# Playwright / Crawl4AI 备用采集服务

此服务只在 TikHub 超时、限流、余额不足或上游异常时由主应用调用。它使用独立的持久化浏览器 Profile，不能绕过登录、验证码或访问权限。

## 启动

```bash
cd fallback_crawler
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn main:app --host 127.0.0.1 --port 8010
```

主项目 `.env`：

```env
FALLBACK_CRAWLER_URL=http://127.0.0.1:8010
FALLBACK_CRAWLER_TOKEN=请使用随机长字符串
```

备用服务进程也要设置相同的 `FALLBACK_CRAWLER_TOKEN`。首次运行会打开 Chromium，由用户人工登录抖音。选择器必须经过人工确认后配置；未配置、登录失效或出现验证码时服务会明确返回错误并停止。
