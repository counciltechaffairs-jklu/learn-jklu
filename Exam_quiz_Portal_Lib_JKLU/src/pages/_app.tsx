import type { AppProps } from 'next/app';
import Head from 'next/head';
import '@/styles/globals.css';
import '@/styles/stageshow/stage.css';
import '@/styles/stageshow/cursor.css';
import '@/styles/stageshow/keys.css';
import '@/styles/stageshow/window.css';
import '@/styles/stageshow/student-demo.css';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Learn JKLU 2.0 — Academic Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </Head>
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0A0A0C] text-[#0A0A0C] dark:text-[#F5F4F0] antialiased">
        <Component {...pageProps} />
      </div>
    </>
  );
}
