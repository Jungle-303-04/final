import { Command } from "cmdk";
import { useState } from "react";

const items = ["التقويم", "البحث", "الحاسبة", "الإعدادات", "الملف الشخصي"];

export default function CommandRtlExample() {
  const [selected, setSelected] = useState(items[0]);

  return (
    <div className="command-demo" dir="rtl">
      <div className="inline-command-layout">
        <Command className="command-dialog inline-command">
          <Command.Input placeholder="ابحث عن أمر..." />
          <Command.List>
            <Command.Empty>لم يتم العثور على نتائج.</Command.Empty>
            <Command.Group heading="اقتراحات">
              {items.map((item) => (
                <Command.Item key={item} onSelect={() => setSelected(item)}>
                  <span>{item}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
        <div className="result-panel">
          <strong>الأمر المحدد</strong>
          <span>{selected}</span>
        </div>
      </div>
    </div>
  );
}
