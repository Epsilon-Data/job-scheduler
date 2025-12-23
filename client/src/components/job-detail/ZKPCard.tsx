import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { API_CONFIG } from "@/lib/constants";
import type { ZKPData, VerificationResult } from "@/types/job";
import type { JobRequest } from "@shared/schema";
import { safeJsonParse } from "@/lib/job-utils";

interface ZKPCardProps {
  jobRequest: JobRequest;
}

function ZKPVerifyButton({ zkp }: { zkp: ZKPData }) {
  const { toast } = useToast();
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const response = await fetch(`${API_CONFIG.ZKP_SERVICE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof: zkp.proof,
          publicSignals: zkp.publicSignals,
          verificationKey: zkp.verificationKey
        })
      });
      const result: VerificationResult = await response.json();

      setVerificationResult(result);

      if (result.success && result.valid) {
        toast({
          title: "Proof is VALID",
          description: "Your execution integrity is cryptographically verified.",
        });
      } else {
        toast({
          title: "Proof verification FAILED",
          description: "This may indicate tampering with code or data.",
          variant: "destructive",
        });
      }
    } catch (error) {
      setVerificationResult({ success: false, error: (error as Error).message });
      toast({
        title: "Connection Error",
        description: "Could not connect to verification service.",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {verificationResult && (
        <span className={`text-xs px-2 py-1 rounded ${
          verificationResult.valid
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}>
          {verificationResult.valid ? 'Valid' : 'Invalid'}
        </span>
      )}
      <button
        onClick={handleVerify}
        disabled={verifying}
        className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {verifying ? 'Verifying...' : 'Verify Proof'}
      </button>
    </div>
  );
}

export function ZKPCard({ jobRequest }: ZKPCardProps) {
  if (!jobRequest.resultMetadata) {
    return null;
  }

  const metadata = safeJsonParse<{ zkp?: ZKPData }>(
    typeof jobRequest.resultMetadata === 'string'
      ? jobRequest.resultMetadata
      : JSON.stringify(jobRequest.resultMetadata),
    {}
  );

  if (!metadata.zkp) {
    return null;
  }

  const zkp: ZKPData = metadata.zkp;
  const zkpStatus = zkp.status as string | undefined;
  const zkpError = zkp.error as string | undefined;

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            🔐 Zero-Knowledge Proof (ZKP)
          </CardTitle>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            zkpStatus === 'generated' ? 'bg-green-100 text-green-800' :
            zkpStatus === 'failed' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {zkpStatus?.toUpperCase() || 'UNKNOWN'}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">🔐 Your Integrity Proof</h4>
          <p className="text-sm text-blue-800 mb-3">
            This ZKP proves your code and dataset weren't tampered with. <strong>You can verify this yourself!</strong>
          </p>

          {/* Script Hash Verification */}
          <div className="bg-white border border-blue-300 rounded-lg p-3 mb-3">
            <h5 className="font-medium text-blue-900 mb-2">✅ Verify Your Script Hash</h5>
            <div className="space-y-2">
              <div className="bg-gray-50 p-2 rounded border">
                <code className="text-xs text-gray-800 break-all">
                  {zkp.scriptHash || 'Not available'}
                </code>
              </div>
              <div className="text-xs text-blue-700">
                <strong>How to verify:</strong>
                <pre className="bg-blue-100 p-2 rounded mt-1 text-xs overflow-x-auto">
{`git clone ${jobRequest.github_repo || 'your-repo'}
sha256sum example_analysis.py
# Should match: ${zkp.scriptHash?.substring(0, 16)}...`}
                </pre>
              </div>
            </div>
          </div>

          {/* Dataset Hash Verification */}
          <div className="bg-white border border-blue-300 rounded-lg p-3 mb-3">
            <h5 className="font-medium text-blue-900 mb-2">✅ Verify Your Dataset Hash</h5>
            <div className="space-y-2">
              <div className="bg-gray-50 p-2 rounded border">
                <code className="text-xs text-gray-800 break-all">
                  {zkp.datasetHash || 'Not available'}
                </code>
              </div>
            </div>
          </div>

          {/* Guarantees */}
          <div className="bg-green-50 border border-green-300 rounded-lg p-3">
            <h5 className="font-medium text-green-900 mb-2">🛡️ What This Guarantees</h5>
            <ul className="text-xs text-green-800 space-y-1">
              <li>• Your exact script ({zkp.executionId}) was executed</li>
              <li>• Your exact dataset was used (no substitution)</li>
              <li>• Execution occurred at: {zkp.timestamp ? new Date(zkp.timestamp).toLocaleString() : 'Unknown'}</li>
              <li>• No tampering during execution</li>
            </ul>
          </div>
        </div>

        {/* Error Details */}
        {zkpStatus === 'failed' && zkpError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-semibold text-red-900 mb-2">Error Details</h4>
            <p className="text-sm text-red-800">{zkpError}</p>
          </div>
        )}

        {/* Verification Section */}
        {zkpStatus === 'generated' && !!zkp.proof && (
          <div className="space-y-3">
            <div className="bg-purple-50 border border-purple-300 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-medium text-purple-900">🔍 Independent Verification</h5>
                <ZKPVerifyButton zkp={zkp} />
              </div>
              <p className="text-xs text-purple-800 mb-2">
                Click to verify this proof instantly.
              </p>
            </div>

            <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <summary className="font-semibold text-gray-900 cursor-pointer">
                📋 Complete Verification Data
              </summary>
              <div className="mt-3 space-y-3 text-sm text-gray-700">
                <div>
                  <p className="mb-2"><strong>Circuit:</strong> {zkp.metadata?.circuit || 'integrity_verification'}</p>
                  <p className="mb-2"><strong>What the proof guarantees:</strong></p>
                  <ul className="text-xs ml-4 space-y-1">
                    <li>• Script hash: {zkp.scriptHash?.substring(0, 32)}...</li>
                    <li>• Dataset hash: {zkp.datasetHash?.substring(0, 32)}...</li>
                    <li>• Execution ID: {zkp.executionId}</li>
                    <li>• Timestamp: {zkp.timestamp ? new Date(zkp.timestamp).toLocaleString() : 'Unknown'}</li>
                  </ul>
                </div>

                <div className="bg-white border rounded p-3">
                  <span className="text-xs font-medium text-gray-600">Public Signals (for verification):</span>
                  <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto max-h-32">
                    {JSON.stringify(zkp.publicSignals, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
