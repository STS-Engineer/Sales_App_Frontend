import logo from "../assets/logo.png";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="card w-full max-w-md p-8">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="AVO Carbon Group" className="h-10 w-auto" />
          <span className="h-1 w-16 rounded-full bg-sun" />
        </div>
        {title ? <h1 className="mt-4 text-center font-display text-3xl font-semibold text-ink">{title}</h1> : null}
        {subtitle ? <p className="mt-2 text-center text-sm text-slate-500">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-6 text-sm text-slate-500">{footer}</div> : null}
      </div>
    </div>
  );
}
