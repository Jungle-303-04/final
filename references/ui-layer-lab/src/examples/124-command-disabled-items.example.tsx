import { Command } from "cmdk";

const actions = [
  { name: "브랜치 푸시", disabled: false },
  { name: "프로덕션 배포", disabled: true },
  { name: "로그 열기", disabled: false }
];

export default function CommandDisabledItemsExample() {
  return (
    <Command className="command-dialog inline-command">
      <Command.Input placeholder="보호된 액션 검색" />
      <Command.List>
        <Command.Group heading="액션">
          {actions.map((action) => (
            <Command.Item disabled={action.disabled} key={action.name}>
              <span>{action.name}</span>
              <kbd>{action.disabled ? "잠김" : "준비"}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
