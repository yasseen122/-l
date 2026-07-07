import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // يضمن قراءة المتصفح للملفات بشكل صحيح بدون صفحات بيضاء
  build: {
    outDir: 'dist', // تحديد مجلد المخرجات الرئيسي للواجهة
  }
})
