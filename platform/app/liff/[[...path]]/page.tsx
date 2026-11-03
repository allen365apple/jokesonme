import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import LiffLogin from "./liff-login";

// LIFF 進入點：https://liff.line.me/<LIFF_ID>/todos → 這頁的 path 為 ["todos"]，登入後回該路徑；沒有路徑就依角色回首頁。
// 已經有有效 session 就直接轉過去，不載入 LIFF SDK（省掉 LINE 的多次跳轉）。
export default async function LiffPage({ params, searchParams }: PageProps<"/liff/[[...path]]">) {
  const { path } = await params;
  const sp = await searchParams;
  const next = path?.length ? `/${path.map(encodeURIComponent).join("/")}` : "/";
  const user = await getCurrentUser();
  // liff.state 存在代表 LINE 正在完成登入流程，交給 SDK 處理
  if (user?.status === "approved" && !sp["liff.state"] && !sp.code) redirect(next);
  return <LiffLogin liffId={process.env.LIFF_ID ?? ""} next={next} />;
}
