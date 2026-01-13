# ADR-008 — Gestione scadenza e cleanup token

## Status
Accepted

## Contesto
Il backend utilizza token temporanei (verifica email, reset password).
È presente uno scheduler in-process ma non è garantita la sua esecuzione continua.

## Decisione
La scadenza dei token è sempre determinata dal campo `expiresAt` nel database.

Strategia:
- I token scaduti sono sempre considerati invalidi in fase di verifica
- Il cleanup dei token scaduti è best-effort
- Uno scheduler in-process può eliminare token scaduti periodicamente,
  ma non è richiesto per la sicurezza

## Conseguenze
- Sicurezza garantita anche in caso di crash o restart
- Nessuna dipendenza da job esterni
- Database mantenuto pulito senza vincoli hard
