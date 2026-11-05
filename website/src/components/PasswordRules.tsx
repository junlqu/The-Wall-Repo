import { PASSWORD_RULES } from "@/lib/account";

// Ticks off each rule a new password has to meet as it's typed.
export default function PasswordRules({ id, password }: { id: string; password: string }) {
  return (
    <ul id={id} className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.label} className={met ? "text-green-700" : "text-red-600"}>
            <span aria-hidden="true">{met ? "✓" : "✗"}</span> {rule.label}
            <span className="sr-only">{met ? " (done)" : " (missing)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
