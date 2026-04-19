import sys

with open("app/services/schedule_service.py", "r", encoding="utf-8") as f:
    target_content = f.read()

with open("patch_schedule_v8_v2.py", "r", encoding="utf-8") as f:
    source_content = f.read()

orchestrator_code = source_content.split('orchestrator_code = """')[1].split('"""')[0]

target_content = target_content.replace("{{ORCHESTRATOR_PLACEHOLDER}}", orchestrator_code + "\n\n")

with open("app/services/schedule_service.py", "w", encoding="utf-8") as f:
    f.write(target_content)

print("Fixed placeholder!")
