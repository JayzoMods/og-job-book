import { PRINT_SAMPLE_MARK } from "@/lib/ledger/print";

export function PrintSampleMark() {
  return (
    <>
      <div className="print-sample-watermark" aria-hidden="true">
        <span>{PRINT_SAMPLE_MARK}</span>
      </div>
      <p className="print-sample-banner">{PRINT_SAMPLE_MARK}</p>
    </>
  );
}
