// 線條圖示（導覽、按鈕用）。stroke 跟著文字顏色走，大小由 CSS 決定。
type P = { className?: string };
const svg = (path: React.ReactNode) =>
  function Icon({ className }: P) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    );
  };

export const IconTodo = svg(<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12.2l2.4 2.3 4.6-4.8" /></>);
export const IconNote = svg(<><path d="M6 3.5h8.5L19 8v12.5H6z" /><path d="M14 3.5V8h5" /><path d="M9 12.5h6M9 16h4" /></>);
export const IconMic = svg(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>);
export const IconCalendar = svg(<><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>);
export const IconMoney = svg(<><rect x="3" y="6" width="18" height="12" rx="3" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v5M17.5 9.5v5" /></>);
export const IconPlus = svg(<path d="M12 5v14M5 12h14" />);
export const IconEdit = svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>);
export const IconChevron = svg(<path d="M9 5l7 7-7 7" />);
export const IconChevronLeft = svg(<path d="M15 5l-7 7 7 7" />);
export const IconHome = svg(<><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-6h4v6" /></>);
export const IconInbox = svg(<><path d="M4 13l2.5-8h11L20 13v6H4z" /><path d="M4 13h5l1.5 2.5h3L15 13h5" /></>);
