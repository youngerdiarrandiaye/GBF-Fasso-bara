import Link from "next/link";
import { MotDePasseOublieForm } from "./MotDePasseOublieForm";

export default function MotDePasseOubliePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h1 font-semibold tracking-tight text-text">Mot de passe oublié</h1>
        <p className="text-body text-muted">
          Saisissez votre adresse e-mail : vous recevrez un lien pour choisir un nouveau mot de
          passe.
        </p>
      </div>
      <MotDePasseOublieForm />
      <Link href="/login" className="text-center text-body text-muted underline">
        Retour à la connexion
      </Link>
    </div>
  );
}
