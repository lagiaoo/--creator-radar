import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from playwright.async_api import BrowserContext, Page, async_playwright


PROFILE_DIR = Path(os.getenv("FALLBACK_BROWSER_PROFILE_DIR", "./work/fallback-browser-profile"))
SERVICE_TOKEN = os.getenv("FALLBACK_CRAWLER_TOKEN", "")
DOUYIN_SEARCH_URL = os.getenv("DOUYIN_SEARCH_URL", "https://www.douyin.com/search/{keyword}?type=user")
SEARCH_RESULT_SELECTOR = os.getenv("DOUYIN_SEARCH_RESULT_SELECTOR", "")
CREATOR_LINK_SELECTOR = os.getenv("DOUYIN_CREATOR_LINK_SELECTOR", "a[href*='/user/']")
CREATOR_NICKNAME_SELECTOR = os.getenv("DOUYIN_CREATOR_NICKNAME_SELECTOR", "")
LOGIN_MARKER_SELECTOR = os.getenv("DOUYIN_LOGIN_MARKER_SELECTOR", "")
CAPTCHA_SELECTOR = os.getenv("DOUYIN_CAPTCHA_SELECTOR", "")

context: BrowserContext | None = None


class SearchRequest(BaseModel):
    keyword: str
    limit: int = 5


class Candidate(BaseModel):
    nickname: str
    profileUrl: str
    sourceVideoUrl: str = ""
    douyinUniqueId: str | None = None
    douyinAccount: str | None = None


class ProfileRequest(BaseModel):
    candidate: Candidate


class WorksRequest(BaseModel):
    profile: dict[str, Any]
    limit: int = 3


def authorize(authorization: str | None = Header(default=None)):
    if SERVICE_TOKEN and authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="备用采集服务 Token 无效")


@asynccontextmanager
async def lifespan(_: FastAPI):
    global context
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    playwright = await async_playwright().start()
    context = await playwright.chromium.launch_persistent_context(str(PROFILE_DIR), headless=False)
    yield
    await context.close()
    await playwright.stop()


app = FastAPI(title="Creator Radar Fallback Crawler", lifespan=lifespan)


async def guarded_page() -> Page:
    if context is None:
        raise HTTPException(status_code=503, detail="浏览器尚未初始化")
    page = await context.new_page()
    return page


async def page_guard(page: Page):
    if CAPTCHA_SELECTOR and await page.locator(CAPTCHA_SELECTOR).count():
        return {"status": "error", "errorType": "CAPTCHA_REQUIRED", "error": "检测到验证码，请人工完成后重试"}
    if LOGIN_MARKER_SELECTOR and not await page.locator(LOGIN_MARKER_SELECTOR).count():
        return {"status": "error", "errorType": "AUTH_REQUIRED", "error": "抖音登录态失效，请人工登录后重试"}
    return None


@app.get("/health", dependencies=[Depends(authorize)])
async def health():
    return {"status": "ok", "profileDir": str(PROFILE_DIR), "searchConfigured": bool(SEARCH_RESULT_SELECTOR and CREATOR_NICKNAME_SELECTOR)}


@app.post("/v1/douyin/search", dependencies=[Depends(authorize)])
async def search(request: SearchRequest):
    if not SEARCH_RESULT_SELECTOR or not CREATOR_NICKNAME_SELECTOR:
        return {"status": "error", "errorType": "UPSTREAM", "error": "备用采集选择器未配置，请先人工确认页面定位器"}
    page = await guarded_page()
    try:
        await page.goto(DOUYIN_SEARCH_URL.format(keyword=request.keyword), wait_until="domcontentloaded", timeout=60000)
        blocked = await page_guard(page)
        if blocked:
            return blocked
        rows = page.locator(SEARCH_RESULT_SELECTOR)
        data = []
        for index in range(min(await rows.count(), request.limit)):
            row = rows.nth(index)
            nickname = (await row.locator(CREATOR_NICKNAME_SELECTOR).inner_text()).strip()
            href = await row.locator(CREATOR_LINK_SELECTOR).first.get_attribute("href")
            if nickname and href:
                profile_url = href if href.startswith("http") else f"https://www.douyin.com{href}"
                data.append(Candidate(nickname=nickname, profileUrl=profile_url).model_dump())
        return {"status": "ok", "data": data}
    finally:
        await page.close()


@app.post("/v1/douyin/profile", dependencies=[Depends(authorize)])
async def profile(request: ProfileRequest):
    # 保留搜索证据作为降级结果；补充字段应在确认稳定页面选择器后实现。
    return {"status": "ok", "data": request.candidate.model_dump()}


@app.post("/v1/douyin/works", dependencies=[Depends(authorize)])
async def works(_: WorksRequest):
    # 作品采集证据不足时返回空列表，主系统会降低置信度而不是伪造内容。
    return {"status": "ok", "data": []}
