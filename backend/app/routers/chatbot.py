from fastapi import APIRouter, HTTPException

from app.schemas import ChatbotAsk, ChatbotAnswer
from app.services import chatbot as chatbot_service
from app.services.chatbot import ChatbotError

router = APIRouter(tags=["chatbot"])


@router.post("/chatbot/query", response_model=ChatbotAnswer)
def query(body: ChatbotAsk):
    try:
        return chatbot_service.ask(body.question)
    except ChatbotError as e:
        # 검증 실패·키 미설정·SQL 실행 실패는 담당자 UI에 문구 그대로 표시
        raise HTTPException(status_code=400, detail=str(e))
