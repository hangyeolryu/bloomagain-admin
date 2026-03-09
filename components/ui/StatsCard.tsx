interface StatsCardProps {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
  delta?: string;
}

export default function StatsCard({ label, value, icon, color = 'bg-gray-100', delta }: StatsCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
          {delta && <p className="text-xs text-gray-400 mt-1">{delta}</p>}
        </div>
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-2xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
