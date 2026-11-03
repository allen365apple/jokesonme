import { requirePage } from "@/lib/auth/current";
import FinanceHead from "@/components/finance-head";
import LegacyImport from "./legacy-import";

// 應援金流匯入：沿用舊 import.js 的配對邏輯（見 public/legacy/import.js 檔頭），只換資料出口與外觀。
export default async function ImportPage() {
  const me = await requirePage("finance", "/finance/import");
  return (
    <main className="page">
      <link rel="stylesheet" href="/legacy/import.css" />
      <FinanceHead me={me} active="import" title="應援金流匯入" />
      <div className="content legacy-import">
        <div className="card">
          <div className="card-title">上傳檔案</div>
          <div className="import-upload-row">
            <div className="import-upload-zone" id="cashflow-zone">
              <div className="upload-label">撥款明細</div>
              <div className="upload-hint">可上傳多個 .xlsx</div>
              <input type="file" accept=".xlsx" id="cashflow-input" multiple hidden />
            </div>
            <div className="import-upload-zone" id="order-zone">
              <div className="upload-label">票券與周邊訂單</div>
              <div className="upload-hint">從應援後台下載票券訂單及周邊訂單 CSV</div>
              <input type="file" accept=".csv" id="order-input" multiple hidden />
            </div>
            <div className="import-upload-zone" id="activity-zone">
              <div className="upload-label">活動報名狀態（選填）</div>
              <div className="upload-hint">上傳活動報名狀態 .xlsx 以自動對應活動與拆分合購金額</div>
              <input type="file" accept=".xlsx" id="activity-input" multiple hidden />
            </div>
          </div>
          <div id="upload-status" />
        </div>
        <div className="card" id="mapping-section" style={{ display: "none" }}>
          <div className="card-title">票券／商品對應專案</div>
          <div id="mapping-list" />
        </div>
        <div id="dashboard-section" style={{ display: "none" }}>
          <div className="stat-grid" id="import-stats" />
          <div className="card" id="breakdown-section">
            <div className="card-title">金流分類明細</div>
            <div id="breakdown-list" />
          </div>
          <div className="card" id="unmatched-section" style={{ display: "none" }}>
            <div className="card-title">未配對項目</div>
            <div id="unmatched-list" />
          </div>
          <div id="import-actions" style={{ display: "none" }}>
            <button className="btn btn-primary" id="btn-import" disabled>匯入到平台</button>
            <span className="import-hint" id="import-hint" />
          </div>
          <div className="card" id="import-summary" style={{ display: "none" }}>
            <div className="card-title">匯入結果</div>
            <div id="import-summary-body" />
          </div>
        </div>
      </div>
      <LegacyImport />
    </main>
  );
}
