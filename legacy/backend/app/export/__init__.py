"""研究資料 Excel 匯出（openpyxl）。不輸出原始投稿或個資，並防止公式注入。"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
import json

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AnalysisRecord, ConsentRecord, PatternDataset, ProductSurveyResponse, ResearchResponse, SourceResult, utcnow
from ..services.statistics import compute_statistics

DATE_FMT = "yyyy-mm-dd hh:mm:ss"
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")
HEADER_FILL = PatternFill("solid", fgColor="DDEBF7")


def safe_cell(value):
    """防止 Excel / CSV 公式注入：以這些字元開頭的文字前面加上單引號，並強制為文字。"""
    if isinstance(value, str):
        value = value.replace("\x00", "")
        if value.startswith(FORMULA_PREFIXES):
            return "'" + value
    return value


def _sheet(wb: Workbook, title: str, headers: list[str], rows: list[list], first: bool = False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append(headers)
    for c in ws[1]:
        c.font, c.fill = Font(bold=True), HEADER_FILL
    for row in rows:
        ws.append([safe_cell(v) for v in row])
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, datetime):
                c.number_format = DATE_FMT
            elif isinstance(c.value, str):
                c.data_type = "s"  # 再保險一次：不讓任何字串被當成公式
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{max(ws.max_row, 1)}"
    for i, h in enumerate(headers, 1):
        longest = max([len(str(h)) * 2] + [min(len(str(r[i - 1])) if r[i - 1] is not None else 0, 60) for r in rows])
        ws.column_dimensions[get_column_letter(i)].width = max(10, min(longest + 2, 60))
    return ws


def build_workbook(db: Session, demo: bool) -> bytes:
    label = "模擬資料（DEMO）" if demo else "正式資料"
    tag = "DEMO" if demo else "正式"
    wb = Workbook()

    analyses = list(db.scalars(select(AnalysisRecord).where(AnalysisRecord.is_demo == demo, AnalysisRecord.consent_research.is_(True))
                               .order_by(AnalysisRecord.created_at)))
    _sheet(wb, "Analysis_Records",
           ["資料類型", "分析編號", "研究編號", "建立時間", "媒體類型", "來源數", "風險指數", "風險等級", "風險特徵", "分析狀態", "規則版本", "使用外部AI", "同意研究", "同意衍生使用"],
           [[tag, a.analysis_id, a.research_id_nullable, a.created_at, a.media_type, a.source_count, a.risk_score_nullable, a.risk_level,
             ",".join(json.loads(a.risk_tags_json)), a.analysis_status, a.rule_version, a.external_ai_used, a.consent_research, a.consent_secondary_use]
            for a in analyses], first=True)

    ids = {a.analysis_id for a in analyses}
    sources = [s for s in db.scalars(select(SourceResult).order_by(SourceResult.checked_at)) if s.analysis_id in ids]
    _sheet(wb, "Source_Results", ["資料類型", "來源結果編號", "分析編號", "來源", "結果狀態", "比對類型", "來源標題", "來源網址", "查核回覆類型", "查核時間", "授權"],
           [[tag, s.source_result_id, s.analysis_id, s.provider, s.result_status, s.match_type, s.source_title, s.source_url, s.reply_type, s.checked_at, s.license_tag]
            for s in sources])

    responses = list(db.scalars(select(ResearchResponse).where(ResearchResponse.is_demo == demo).order_by(ResearchResponse.created_at)))
    _sheet(wb, "Research_Responses",
           ["資料類型", "作答編號", "研究編號", "實驗組別", "案例編號", "階段", "使用者判斷", "自述理由代碼", "是否正確", "錯誤類型", "作答時間(毫秒)", "輔助方式", "系統顯示特徵", "研究者人工分類", "建立時間"],
           [[tag, r.response_id, r.research_id, r.experiment_group, r.case_id, r.phase, r.user_decision, r.decision_reason_code, r.correctness, r.error_type,
             r.response_time_ms, r.assistance_used, ",".join(json.loads(r.system_triggers_json or "[]")), r.researcher_category, r.created_at] for r in responses])

    patterns = list(db.scalars(select(PatternDataset)))
    _sheet(wb, "Pattern_Dataset", ["模式編號", "詐騙類型", "心理誘因", "風險指標", "防範方式", "驗證狀態", "證據來源", "來源授權", "人工審核狀態", "資料集版本"],
           [[p.pattern_id, p.scam_category, p.psychological_trigger, p.risk_indicators, p.prevention_method, p.verification_status,
             p.evidence_source, p.source_license, p.human_review_status, p.dataset_version] for p in patterns])

    consents = list(db.scalars(select(ConsentRecord).where(ConsentRecord.is_demo == demo).order_by(ConsentRecord.consent_time)))
    _sheet(wb, "Consent_Records", ["資料類型", "同意編號", "研究編號", "目的", "同意書版本", "狀態", "同意時間", "撤回時間"],
           [[tag, c.consent_id, c.research_id, c.purpose, c.consent_version, c.consent_status, c.consent_time, c.withdrawal_time] for c in consents])

    surveys = list(db.scalars(select(ProductSurveyResponse).where(ProductSurveyResponse.is_demo == demo)))
    _sheet(wb, "Product_Survey", ["資料類型", "問卷編號", "身分", "產品", "價值評分(1-5)", "最需要功能", "教師願意課堂使用", "口頭興趣", "試用意願", "付款意願", "可接受價格", "建立時間"],
           [[tag, s.survey_id, s.respondent_role, s.product, s.perceived_value, s.most_needed_feature, s.teacher_would_use, s.verbal_interest,
             s.trial_intent, s.payment_intent, s.acceptable_price_range, s.created_at] for s in surveys])

    st = compute_statistics(db, demo)
    na = lambda v: "無資料" if v is None else v  # noqa: E731
    pct = lambda v: "無資料" if v is None else f"{v * 100:.1f}%"  # noqa: E731
    rows = [
        ["資料類型", label], ["匯出時間(UTC)", utcnow()], ["說明", "僅包含已同意研究的匿名紀錄；不含原始投稿、圖片、影片或個資。"],
        ["分析紀錄數", st["analysis_records"]], ["研究參與者數", st["participants"]], ["有效樣本數（完成前後測）", st["valid_samples"]],
    ]
    for g, v in st["groups"].items():
        rows += [[f"{g} 組人數", v["participants"]], [f"{g} 組有效樣本", v["valid_samples"]], [f"{g} 組前測正確率", pct(v["pre_accuracy"])],
                 [f"{g} 組後測正確率", pct(v["post_accuracy"])], [f"{g} 組前後測差異", pct(v["accuracy_change"])],
                 [f"{g} 組看過輔助後改變決策人數", v["decision_changed_after_assist"]]]
    sc, jd, fb = st["source_check"], st["judgement"], st["feedback"]
    rows += [["查核嘗試次數", sc["attempted"]], ["查核成功率", pct(sc["success_rate"])], ["判斷作答數", jd["answers"]], ["判斷正確率", pct(jd["accuracy"])],
             ["誤判（正常判為詐騙）", jd["false_positive"]], ["漏判（詐騙判為正常）", jd["false_negative"]], ["無法判斷", jd["unsure"]]]
    rows += [[f"風險特徵次數：{k}", v] for k, v in st["risk_tag_counts"].items()] or [["風險特徵次數", "無資料"]]
    rows += [["回饋數", fb["count"]], ["回饋：有幫助", fb["helpful_yes"]], ["回饋：沒幫助", fb["helpful_no"]], ["平均評分", na(fb["avg_rating"])]]
    _sheet(wb, "Summary", ["指標", "數值"], rows)
    wb.active = len(wb.sheetnames) - 1

    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                c.alignment = Alignment(wrap_text=False, vertical="top")
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
