import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttestationData } from "@/types/job";
import type { JobRequest } from "@shared/schema";
import { safeJsonParse } from "@/lib/job-utils";

interface AttestationCardProps {
  jobRequest: JobRequest;
}

export function AttestationCard({ jobRequest }: AttestationCardProps) {
  const [showRawDoc, setShowRawDoc] = useState(false);

  const attestationRaw = (jobRequest as any).attestation;
  if (!attestationRaw) {
    return null;
  }

  const attestation = safeJsonParse<AttestationData>(
    typeof attestationRaw === 'string' ? attestationRaw : JSON.stringify(attestationRaw),
    null as any
  );

  if (!attestation?.attestation) {
    return null;
  }

  const { attestation: doc, proof, verification_guide } = attestation;
  const proofTimestamp = proof?.timestamp
    ? new Date(proof.timestamp * 1000).toLocaleString()
    : 'Unknown';

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Enclave Attestation (TEE)
          </CardTitle>
          <div className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            ATTESTED
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* What This Proves */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">What This Proves</h4>
          <p className="text-sm text-blue-800 mb-3">
            This attestation is <strong>cryptographic proof from AWS hardware</strong> that your code
            ran inside a genuine Nitro Enclave. It cannot be forged.
          </p>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>- The exact enclave image (code) that executed your job</li>
            <li>- The output hash is tied to this specific execution</li>
            <li>- AWS Nitro hardware signed this attestation</li>
          </ul>
        </div>

        {/* Proof Details */}
        {proof && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-gray-900">Execution Proof</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-medium text-gray-500">Job ID</span>
                <div className="bg-gray-50 p-2 rounded border mt-1">
                  <code className="text-xs text-gray-800">{proof.job_id}</code>
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Timestamp</span>
                <div className="bg-gray-50 p-2 rounded border mt-1">
                  <code className="text-xs text-gray-800">{proofTimestamp}</code>
                </div>
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500">Output Hash (SHA-256)</span>
              <div className="bg-gray-50 p-2 rounded border mt-1">
                <code className="text-xs text-gray-800 break-all">{proof.output_hash}</code>
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500">Nonce</span>
              <div className="bg-gray-50 p-2 rounded border mt-1">
                <code className="text-xs text-gray-800 break-all">{proof.nonce}</code>
              </div>
            </div>
          </div>
        )}

        {/* Attestation Document Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h4 className="font-semibold text-gray-900">Attestation Document</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-xs font-medium text-gray-500">Format</span>
              <p className="text-gray-800">{doc.format}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500">Signed By</span>
              <p className="text-gray-800">{doc.signed_by}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500">Size</span>
              <p className="text-gray-800">{doc.attestation_document_length} bytes</p>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500">User Data</span>
              <p className="text-gray-800">{doc.user_data_included ? 'Included' : 'Not included'}</p>
            </div>
          </div>
        </div>

        {/* Verification Guide */}
        {verification_guide && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-900 mb-2">How to Verify</h4>
            <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
              {Object.entries(verification_guide).map(([key, step]) => (
                <li key={key}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Raw Attestation Document (collapsible) */}
        <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <summary className="font-semibold text-gray-900 cursor-pointer">
            Raw Attestation Document (CBOR/COSE)
          </summary>
          <div className="mt-3">
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto max-h-48 break-all whitespace-pre-wrap">
              {doc.attestation_document}
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
