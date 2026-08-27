import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export function LoginPage() {
  const { login, userName } = useApp()
  const [name, setName] = useState(userName || '')
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login(name)
    navigate('/pay')
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="brand-mark">HOLIC GEM</p>
        <h1>회원가입</h1>
        <p>가입만 해도 환영 쿠폰이 Pay &gt; 쿠폰에 들어가요</p>
      </header>

      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          닉네임
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 부산여행러"
            required
          />
        </label>
        <button type="submit" className="btn btn-primary full">
          가입하고 쿠폰 받기
        </button>
      </form>

      <Link to="/" className="text-link">
        홈으로
      </Link>
    </div>
  )
}
