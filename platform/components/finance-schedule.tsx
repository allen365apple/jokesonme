import type { ScheduleEvent } from "@/lib/finance/schedule";
import { shortDate } from "@/lib/finance/schedule";

// 財務時程：一排小 chips（首頁與財務總覽共用）。日期與剩餘天數由 lib/finance/schedule.ts 算。
export default function FinanceSchedule({ events }: { events: ScheduleEvent[] }) {
  return (
    <div className="sched-chips" aria-label="財務時程">
      {events.map((e) => {
        const soon = e.days !== null && e.days <= 7;
        return (
          <span key={e.key} className={`sched-chip${soon ? " soon" : ""}`} title={e.showName ? `${e.title}：${e.showName}` : e.title}>
            <b>{e.lead}</b>
            <span>{e.title}</span>
            {e.date ? <em>{shortDate(e.date)}・{e.days === 0 ? "今天" : `${e.days} 天`}</em> : <em>尚無排定</em>}
          </span>
        );
      })}
    </div>
  );
}
