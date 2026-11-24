"use client";

import { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "react-toastify";
import Button from "@/components/Button";
import { errorMessage, useCatalogueApi } from "@/features/catalogue/api";
import { ErrorBox, Modal } from "@/features/catalogue/components/ui";
import type { ListSummary } from "@/features/catalogue/types";

interface CsvImportDialogProps {
    open: boolean;
    list: ListSummary;
    onClose: () => void;
    onSuccess?: () => void;
}

function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
            if (inQuotes && line[i + 1] === char) {
                current += char;
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

export default function CsvImportDialog({
    open,
    list,
    onClose,
    onSuccess,
}: CsvImportDialogProps) {
    const t = useTranslations();
    const call = useCatalogueApi();

    const [csvText, setCsvText] = useState("");
    const [fileName, setFileName] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            setCsvText(event.target?.result as string || "");
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!csvText.trim()) {
            setError("Please provide CSV content to import.");
            return;
        }

        setError(null);
        setImporting(true);
        setProgress(0);

        try {
            const lines = csvText
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);

            if (lines.length < 2) {
                throw new Error("CSV must have at least a header row and one data row.");
            }

            const rawHeaders = parseCSVLine(lines[0]);
            const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));

            // Detect standard columns
            const codeIdx = headers.findIndex((h) => ["value_code", "code", "id", "key"].includes(h));
            const displayIdx = headers.findIndex((h) => ["display", "label", "name", "title"].includes(h));
            const parentIdx = headers.findIndex((h) => ["parent_code", "parent", "parent_id"].includes(h));
            const sortIdx = headers.findIndex((h) => ["sort_order", "sort", "order"].includes(h));

            if (codeIdx === -1) {
                throw new Error(`CSV must have a "code" or "value_code" column. Headers found: ${rawHeaders.join(", ")}`);
            }

            const schemaProps = (list.attribute_schema?.properties ?? {}) as Record<string, any>;

            const valuesToImport: Array<{
                value_code: string;
                display?: string;
                parent_code?: string;
                sort_order?: number;
                status: string;
                attributes?: Record<string, unknown>;
            }> = [];

            for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                const code = cols[codeIdx]?.trim();
                if (!code) continue;

                const display = displayIdx !== -1 ? cols[displayIdx]?.trim() || code : code;
                const parentCode = parentIdx !== -1 ? cols[parentIdx]?.trim() || undefined : undefined;
                const sortOrder = sortIdx !== -1 && cols[sortIdx] ? Number(cols[sortIdx]) : i;

                // Collect extra fields into attributes
                const attributes: Record<string, unknown> = {};
                for (let c = 0; c < cols.length; c++) {
                    if (c === codeIdx || c === displayIdx || c === parentIdx || c === sortIdx) continue;
                    const colHeader = rawHeaders[c] || `col_${c}`;
                    const rawVal = cols[c]?.trim();
                    if (rawVal === undefined || rawVal === "") continue;

                    // Match schema property type if defined
                    const schemaDef = schemaProps[colHeader];
                    if (schemaDef?.type === "number" || schemaDef?.type === "integer") {
                        const num = Number(rawVal);
                        attributes[colHeader] = isNaN(num) ? rawVal : num;
                    } else if (schemaDef?.type === "boolean") {
                        attributes[colHeader] = rawVal.toLowerCase() === "true" || rawVal === "1";
                    } else {
                        attributes[colHeader] = rawVal;
                    }
                }

                valuesToImport.push({
                    value_code: code,
                    display,
                    parent_code: parentCode,
                    sort_order: isNaN(sortOrder) ? i : sortOrder,
                    status: "ACTIVE",
                    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
                });
            }

            if (valuesToImport.length === 0) {
                throw new Error("No valid data rows found in CSV.");
            }

            // Ingest in batches of 50
            const BATCH_SIZE = 50;
            const total = valuesToImport.length;
            let imported = 0;

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = valuesToImport.slice(i, i + BATCH_SIZE);
                await call("upsert_draft_values", {
                    list_code: list.list_id,
                    values: batch,
                });
                imported += batch.length;
                setProgress(Math.round((imported / total) * 100));
            }

            toast.success(`Successfully imported ${imported} entries into draft!`);
            onSuccess?.();
            onClose();
        } catch (e: any) {
            const msg = errorMessage(e) || e.message;
            setError(msg);
            toast.error(msg);
        } finally {
            setImporting(false);
            setProgress(null);
        }
    };

    return (
        <Modal open={open} title={`Import CSV into ${list.display || list.list_id}`} onClose={onClose} maxWidth={640}>
            <div className="space-y-5">
                <p className="text-[14px] text-gray-600">
                    Upload a CSV file or paste CSV content below to bulk-add or update entries in this draft.
                    Columns matching the catalog schema will be automatically assigned to entry attributes.
                </p>

                {/* File Upload Box */}
                <label className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-[#ED7C22] bg-gray-50/50 transition-colors">
                    <Upload size={32} className="text-[#ED7C22] mb-2" />
                    <span className="text-[14px] font-semibold text-gray-800">
                        {fileName ? fileName : "Click to select a CSV file"}
                    </span>
                    <span className="text-[12px] text-gray-500 mt-1">.csv or text files accepted</span>
                    <input type="file" accept=".csv,text/csv,text/plain" onChange={handleFileUpload} className="hidden" />
                </label>

                {/* Raw CSV Textarea */}
                <div>
                    <label className="block text-[13px] font-semibold text-gray-700 mb-1.5 flex items-center justify-between">
                        <span>Or Paste CSV Content</span>
                        <span className="text-[12px] text-gray-400 font-normal">Header row required</span>
                    </label>
                    <textarea
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                        placeholder="code,display,sort_order,property_1,property_2&#10;ITEM01,First Item,1,valueA,valueB"
                        rows={6}
                        className="w-full font-mono text-[13px] p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#ED7C22]"
                    />
                </div>

                {progress !== null ? (
                    <div className="space-y-1">
                        <div className="flex justify-between text-[12px] text-gray-600 font-medium">
                            <span>Importing entries...</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#ED7C22] transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                ) : null}

                <ErrorBox message={error} />

                <div className="flex gap-4 w-full justify-end pt-2">
                    <Button variant="secondary" onClick={onClose} disabled={importing}>
                        {t("cancel")}
                    </Button>
                    <Button variant="primary" onClick={handleImport} loading={importing}>
                        {importing ? "Importing..." : "Start Import"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

