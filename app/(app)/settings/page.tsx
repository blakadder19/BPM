import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Academy configuration and business rules."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Penalty Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Late cancel fee</span>
              <Badge variant="warning">€2.00</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">No-show fee</span>
              <Badge variant="danger">€5.00</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role-Balanced Styles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[
                "Bachata",
                "Bachata Tradicional",
                "Bachata Partnerwork",
                "Cuban",
                "Salsa Line",
              ].map((style) => (
                <Badge key={style} variant="info">
                  {style}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supabase</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Database connection not configured. Add your Supabase credentials
              to <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">.env.local</code> to connect.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Stripe integration is placeholder-ready. Payment processing will be
              added in a future iteration.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
