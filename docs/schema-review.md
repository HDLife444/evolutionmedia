# Starter schema review

The initial migration is imported unchanged from the supplied starter ZIP.
It establishes songs, assets, embeddings, lineage, generation jobs, and feedback.
All six tables enable row-level security (RLS); authenticated users have SELECT
policies and no application write policies.

## Useful foundation

- Private songs require an owner and are readable only by their owner.
- Assets and embeddings inherit song visibility. Lineage requires permission
  to view both the parent and child.
- Generation jobs and feedback are readable only by their respective users.
- Retrieval visibility, rights status, reuse permission, training permission,
  and industry status are separate fields.
- Provider identifiers leave generation independent of a specific vendor.

## Resolve before implementing ingestion and retrieval

1. **Embedding spaces:** all modalities currently use vector(1536). Audio and
   text models can have different dimensions and incompatible spaces. Select
   the first text model and record its version; introduce separate model/dimension
   storage and search contracts before audio embeddings. Never compare vectors
   from different models just because their dimensions match.
2. **Rights and consent:** SELECT policies expose collective songs even when
   rights_status is unverified or reuse_allowed is false. That is catalog access,
   not generation permission. Retrieval for generation needs a separate eligibility
   rule and explicit consent records. Training requires its own permission.
3. **Personal data:** collective SELECT includes full lyrics, descriptions,
   metadata, and embedding chunk text. Define what can be shared and what must
   remain private or be redacted before real personalized content is uploaded.
4. **Storage:** asset table policies do not secure Storage objects. Create a
   private bucket, owner-checked upload paths, and authorized download policies
   or short-lived URLs. No bucket is created by this migration.
5. **Write authorization:** trusted service credentials bypass RLS. The backend
   must enforce ownership, privacy entitlements, visibility changes, and audit
   records. No upload endpoint or premium entitlement enforcement exists yet.
6. **Ingestion durability:** add job/status tracking, idempotency, retry behavior,
   and reconciliation so stored audio cannot be silently left unindexed.
   Generation completion must include durable registration and indexing work.
7. **Lifecycle details:** updated_at has no update trigger; deleting an owner
   of a private song conflicts with the owner-required constraint; feedback
   is not constrained to one response per user/song. Decide intended behavior
   and add a follow-up migration with tests.
8. **Octave semantics:** confirm the allowed progression stages before relying
   on the provisional octave_stage range of 1–12.

## Validation scope

The local database test applies this migration to real PostgreSQL with pgvector.
It supplies a minimal auth.users/auth.uid() stand-in and representative Supabase
role grants. It checks visibility for two users, lineage, jobs, feedback, vector
storage, unauthenticated access, and denial of authenticated writes.

This is a schema/RLS test, not a hosted Supabase deployment test. It does not
verify Storage policies, production role grants, authentication tokens, embedding
generation, ingestion, premium billing, or musical quality.
