import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './accents.css'
import { initPrefs } from './prefs'
import { bootLanguage } from './i18n/dictionary'
import { LanguageProvider } from './language'
import { languageFromPath } from './i18n/languages'

initPrefs()

// 先決定語言並載入語言檔再顯示，避免第一次造訪時先閃過繁中。
// /en/…、/ja/… 等語言網址：以前綴當 basename，網站其他程式看到的路徑與原網址相同。
const { basename } = languageFromPath(location.pathname)
void bootLanguage().then(initial => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LanguageProvider initial={initial}>
        <BrowserRouter basename={basename || undefined}>
          <App />
        </BrowserRouter>
      </LanguageProvider>
    </StrictMode>,
  )
})
