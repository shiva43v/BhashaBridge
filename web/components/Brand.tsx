import Link from "next/link";
export default function Brand() {
  return (
    <Link href="/" className="brand" aria-label="BhashaBridge home">
      <svg viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="9" fill="#1c2541" />
        <path d="M5 22c4-9 20-9 24 0" fill="none" stroke="#f4a300" strokeWidth="3" strokeLinecap="round" />
        <path d="M5 22h24" stroke="#0f8b8d" strokeWidth="3" strokeLinecap="round" />
        <circle cx="9" cy="13" r="2" fill="#fff" /><circle cx="25" cy="13" r="2" fill="#fff" />
      </svg>
      BhashaBridge
    </Link>
  );
}
