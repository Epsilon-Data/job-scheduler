import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";

const PII_FIELDS = [
  'patient_id',
  'patient_name',
  'medical_record',
  'date_of_birth',
  'ssn',
  'email',
  'phone',
  'address'
];

export function DefaultPolicyCard() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="mb-8">
      <CardHeader>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <span className="text-lg">🔒</span>
            <CardTitle>Default Policy (Simplified)</CardTitle>
            <Badge variant="outline" className="text-xs">HEALTHCARE</Badge>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-800 mb-2">Healthcare Dataset Policy</h4>
              <p className="text-sm text-gray-600 mb-4">
                This default policy is applied to all healthcare datasets to ensure privacy compliance.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* PII Fields */}
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <h5 className="font-medium text-gray-700 mb-2 flex items-center">
                    <span className="text-red-500 mr-2">🔒</span>
                    PII Fields Protected
                  </h5>
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-2">
                      {PII_FIELDS.map((field) => (
                        <span
                          key={field}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">+ other healthcare identifiers</p>
                  </div>
                </div>

                {/* Validation Requirements */}
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <h5 className="font-medium text-gray-700 mb-2 flex items-center">
                    <span className="text-blue-500 mr-2">📊</span>
                    Validation Requirements
                  </h5>
                  <div className="space-y-2">
                    <ValidationItem positive text="Row count must be reported" />
                    <ValidationItem positive text="PII detection required" />
                    <ValidationItem positive={false} text="Reject if PII detected" />
                    <ValidationItem positive text="Approve if no PII found" />
                  </div>
                </div>
              </div>

              <div className="mt-4 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <p className="text-xs text-yellow-800">
                  <strong>Note:</strong> This policy ensures that any code accessing healthcare data
                  cannot expose or output personally identifiable information.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ValidationItem({ positive, text }: { positive: boolean; text: string }) {
  return (
    <div className="flex items-center text-sm">
      <span className={`mr-2 ${positive ? 'text-green-500' : 'text-red-500'}`}>
        {positive ? '✓' : '✗'}
      </span>
      <span className="text-gray-600">{text}</span>
    </div>
  );
}
