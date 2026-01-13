# ADR-007 — Reset password con token monouso e revoca sessioni

## Status
Accepted

## Contesto
Il Community Backend SBELM utilizza autenticazione email/password con sessioni
persistenti server-side. Per completare il MVP è necessario introdurre un reset
password reale e sicuro.

Requisiti:
- nessuna user enumeration
- token temporaneo
- invalidazione delle sessioni esistenti
- coerenza con l’architettura esistente

## Decisione
Il reset password viene implementato tramite token monouso con scadenza (TTL),
inviato via email.

Flusso:
1. L’utente richiede il reset password fornendo l’email.
2. Il backend risponde sempre 200 OK.
3. Se l’utente esiste e l’account è attivo:
   - viene generato un token ad alta entropia
   - viene salvato solo l’hash del token
   - viene inviato il link di reset via email
4. Alla conferma del reset:
   - il token viene validato (hash + scadenza + non usato)
   - la password viene aggiornata
   - tutte le sessioni dell’utente vengono revocate
   - il token viene marcato come usato

## Dettagli di sicurezza
- I token non sono mai salvati in chiaro
- I token hanno TTL breve (30–60 minuti)
- I token sono monouso
- Nessuna informazione sull’esistenza dell’utente viene rivelata

## Conseguenze
- Sicurezza massima per l’utente
- Nessun cambiamento all’architettura di sessione esistente
- Implementazione coerente con ADR-FE-001
