create table if not exists public.alicia_conversations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 title text not null default 'Conversa com Alicia',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.alicia_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.alicia_conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('user','assistant')),
 content text not null check (char_length(content) between 1 and 12000),
 created_at timestamptz not null default now()
);
create table if not exists public.alicia_memories (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 category text not null,
 content text not null check (char_length(content) between 1 and 3000),
 importance smallint not null default 3 check (importance between 1 and 5),
 source_message_id uuid references public.alicia_messages(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, category, content)
);
create index if not exists alicia_messages_user_created_idx on public.alicia_messages(user_id, created_at desc);
create index if not exists alicia_messages_conversation_created_idx on public.alicia_messages(conversation_id, created_at desc);
create index if not exists alicia_memories_user_importance_idx on public.alicia_memories(user_id, importance desc, updated_at desc);
alter table public.alicia_conversations enable row level security;
alter table public.alicia_messages enable row level security;
alter table public.alicia_memories enable row level security;
drop policy if exists alicia_conversations_owner_all on public.alicia_conversations;
create policy alicia_conversations_owner_all on public.alicia_conversations for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists alicia_messages_owner_all on public.alicia_messages;
create policy alicia_messages_owner_all on public.alicia_messages for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists alicia_memories_owner_all on public.alicia_memories;
create policy alicia_memories_owner_all on public.alicia_memories for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.alicia_conversations, public.alicia_messages, public.alicia_memories from anon;
grant select, insert, update, delete on public.alicia_conversations, public.alicia_messages, public.alicia_memories to authenticated;
grant all on public.alicia_conversations, public.alicia_messages, public.alicia_memories to service_role;
