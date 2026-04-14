'use client'
import { useRouter } from 'next/navigation'
import PlaNeatLogo from '@/components/PlaNeatLogo'

export default function RegisterPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #0ea5e9 100%)' }}>
      <div className="w-full max-w-sm mx-auto px-6 text-center relative z-10">
        <div className="flex justify-center mb-5">
          <PlaNeatLogo size="lg" showText={true} />
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl text-center">
          <span className="material-icons text-5xl text-slate-300">lock</span>
          <h2 className="mt-3 text-lg font-bold text-slate-700">ปิดการสมัครสมาชิก</h2>
          <p className="mt-2 text-sm text-slate-500">
            ระบบรับสมาชิกผ่าน <strong className="text-green-600">LINE Login</strong> เท่านั้น<br />
            กรุณาติดต่อทีม IT เพื่อขอสิทธิ์เข้าใช้งาน
          </p>
          <button onClick={() => router.replace('/login')}
            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium">
            กลับหน้า Login
          </button>
        </div>
      </div>
    </div>
  )
}
