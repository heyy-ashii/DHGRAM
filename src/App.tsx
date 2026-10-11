import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth } from './components/Guards'
import PublicLayout from './components/PublicLayout'
import { PageSpinner } from './components/ui'
import Contact from './pages/Contact'
import Feed from './pages/Feed'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const Account = lazy(() => import('./pages/Account'))
const Profile = lazy(() => import('./pages/Profile'))
const Messages = lazy(() => import('./pages/Messages'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminChats = lazy(() => import('./pages/admin/Chats'))

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
          <Route path="discover" element={<Navigate to="/feed" replace />} />
          <Route path="about" element={<Navigate to="/profile" replace />} />
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
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="chats" element={<AdminChats />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
