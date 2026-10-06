"""受控诊断事件：只允许枚举/编号/计数，禁止正文、请求与响应。"""
import json
import os
import re
import sys
import time

FIELDS = {'blockId','batchIds','attempt','completed','total','elapsedMs','httpStatus','promptTokens','completionTokens','resumed','invalidated','rule','model','sourceHash','validatorVersion','missingTokenIds','duplicateTokenIds'}

def event(code, stage, **attributes):
    safe = {}
    for key, value in attributes.items():
        if key not in FIELDS: continue
        if isinstance(value, (int, float, bool)) or (isinstance(value, list) and all(type(v) is int for v in value)):
            safe[key] = value
        elif isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', value): safe[key] = value
    record = {'timestamp':int(time.time()*1000),'level':'ERROR' if any(x in code for x in ('FAILED','MISMATCH','EMPTY','TIMEOUT')) else 'WARN' if 'RETRY' in code else 'INFO','event':code,'stage':stage,'operationId':os.environ.get('RD_OPERATION_ID','standalone'),'attributes':safe}
    try: print('RDLOG '+json.dumps(record,ensure_ascii=False),file=sys.stderr,flush=True)
    except (OSError,ValueError): pass
