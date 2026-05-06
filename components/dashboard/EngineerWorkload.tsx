interface EngineerWorkloadProps {
  engineers: { full_name: string; workload: number }[]
}

export default function EngineerWorkload({ engineers }: EngineerWorkloadProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 text-sm mb-4">Engineer Workload</h2>
      {engineers.length === 0 ? (
        <p className="text-gray-400 text-sm">No active engineers.</p>
      ) : (
        <div className="space-y-3">
          {engineers.map((eng) => (
            <div key={eng.full_name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 font-medium">{eng.full_name}</span>
                <span className="text-gray-500">{eng.workload}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(eng.workload, 100)}%`,
                    background:
                      eng.workload >= 90
                        ? '#ef4444'
                        : eng.workload >= 70
                        ? '#f59e0b'
                        : '#22c55e',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
