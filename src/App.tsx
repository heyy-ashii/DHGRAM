import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/Guards'
import PublicLayout from './components/PublicLayout'
import { PageSpinner } from './components/ui'
import About from './pages/About'
import Contact from './pages/Contact'
import Feed from './pages/Feed'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const Account = lazy(() => import('./pages/Account'))
const Profile = lazy(() => import('./pages/Profile'))
const Messages = lazy(() => import('./pages/Messages'))

export default function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="feed" element={<Feed />} />
          <Route
            path="messages"
            element={
              <RequireAuth>
                <Messages />
              </RequireAuth>
            }
          />
          <Route
            path="profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route path="u/:username" element={<Profile />} />
          <Route path="contact" element={<Contact />} />
          <Route path="about" element={<About />} />
          <Route path="discover" element={<Navigate to="/feed" replace />} />
          <Route path="programs/:id" element={<Navigate to="/feed" replace />} />
          <Route path="search" element={<Navigate to="/feed" replace />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Login initialMode="signup" />} />
          <Route
            path="account"
            element={
              <RequireAuth>
                <Account />
              </RequireAuth>
            }
          />
          <Route path="admin/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
