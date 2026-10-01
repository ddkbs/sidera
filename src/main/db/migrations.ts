// Ordered, append-only migrations. Index + 1 == PRAGMA user_version after applying.
// Keep in sync with ./schema.ts (Drizzle, used for typed queries).
export const migrations: string[] = [
  /* 1: core model */ `
  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}',
    content_text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX cards_updated_idx ON cards(updated_at DESC);

  CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT 'gray',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE card_tags (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, tag_id)
  );
  CREATE INDEX card_tags_tag_idx ON card_tags(tag_id);

  CREATE TABLE tag_properties (
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    options TEXT NOT NULL DEFAULT '[]',
    position REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE card_property_values (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    property_id TEXT NOT NULL REFERENCES tag_properties(id) ON DELETE CASCADE,
    value TEXT,
    position REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (card_id, property_id)
  );

  CREATE TABLE backlinks (
    source_card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    target_card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    PRIMARY KEY (source_card_id, target_card_id)
  );
  CREATE INDEX backlinks_target_idx ON backlinks(target_card_id);

  CREATE TABLE whiteboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES whiteboards(id) ON DELETE SET NULL,
    viewport TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

  CREATE TABLE whiteboard_objects (
    id TEXT PRIMARY KEY,
    whiteboard_id TEXT NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    ref_id TEXT,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    z INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX wo_board_idx ON whiteboard_objects(whiteboard_id);
  CREATE INDEX wo_ref_idx ON whiteboard_objects(ref_id);

  CREATE TABLE connections (
    id TEXT PRIMARY KEY,
    whiteboard_id TEXT NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES whiteboard_objects(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES whiteboard_objects(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX conn_board_idx ON connections(whiteboard_id);

  CREATE TABLE journal_entries (
    date TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE
  );

  CREATE TABLE files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE cards_fts USING fts5(
    title, content_text, content='cards', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER cards_ai AFTER INSERT ON cards BEGIN
    INSERT INTO cards_fts(rowid, title, content_text) VALUES (new.rowid, new.title, new.content_text);
  END;
  CREATE TRIGGER cards_ad AFTER DELETE ON cards BEGIN
    INSERT INTO cards_fts(cards_fts, rowid, title, content_text) VALUES ('delete', old.rowid, old.title, old.content_text);
  END;
  CREATE TRIGGER cards_au AFTER UPDATE ON cards BEGIN
    INSERT INTO cards_fts(cards_fts, rowid, title, content_text) VALUES ('delete', old.rowid, old.title, old.content_text);
    INSERT INTO cards_fts(rowid, title, content_text) VALUES (new.rowid, new.title, new.content_text);
  END;
  `,
  /* 2: card appearance */ `
  ALTER TABLE cards ADD COLUMN color TEXT;
  ALTER TABLE cards ADD COLUMN icon TEXT;
  `,
  /* 3: whiteboard folders */ `
  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    position REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX folders_parent_idx ON folders(parent_id);

  ALTER TABLE whiteboards ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
  CREATE INDEX whiteboards_folder_idx ON whiteboards(folder_id);
  `,
  /* 4: task comments */ `
  CREATE TABLE task_comments (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX task_comments_task_idx ON task_comments(card_id, task_id);

  CREATE TABLE task_comment_files (
    comment_id TEXT NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id),
    PRIMARY KEY (comment_id, file_id)
  );
  `,
  /* 5: profiles */ `
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
    color TEXT NOT NULL DEFAULT 'blue',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  ALTER TABLE task_comments ADD COLUMN author_id TEXT REFERENCES profiles(id) ON DELETE SET NULL;
  CREATE INDEX task_comments_author_idx ON task_comments(author_id);
  `,
  /* 6: remove journal */ `
  DROP TABLE journal_entries;
  `,
  /* 7: task metadata + activity */ `
  CREATE TABLE task_meta (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'none',
    assignee_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    due_date TEXT,
    created_by_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (card_id, task_id)
  );
  CREATE INDEX task_meta_assignee_idx ON task_meta(assignee_profile_id);

  CREATE TABLE task_activity (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    actor_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX task_activity_task_idx ON task_activity(card_id, task_id);
  `,
  /* 8: connection styling */ `
  ALTER TABLE connections ADD COLUMN color TEXT;
  ALTER TABLE connections ADD COLUMN line_style TEXT NOT NULL DEFAULT 'solid';
  ALTER TABLE connections ADD COLUMN arrows TEXT NOT NULL DEFAULT 'end';
  `,
  /* 9: pdf highlights */ `
  CREATE TABLE pdf_highlights (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    page INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL DEFAULT 'yellow',
    text TEXT NOT NULL DEFAULT '',
    note TEXT,
    rects TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX pdf_highlights_file_idx ON pdf_highlights(file_id, page);
  `,
  /* 10: whiteboard properties */ `
  ALTER TABLE whiteboards ADD COLUMN properties TEXT NOT NULL DEFAULT '[]';
  `,
  /* 11: text blocks (cards written directly on a whiteboard) */ `
  ALTER TABLE cards ADD COLUMN kind TEXT NOT NULL DEFAULT 'card';
  CREATE INDEX cards_kind_idx ON cards(kind);
  `,
  /* 12: one text element on boards — legacy heading objects (kind 'text') are dropped (clean start, no migration) */ `
  DELETE FROM connections WHERE source_id IN (SELECT id FROM whiteboard_objects WHERE kind = 'text')
    OR target_id IN (SELECT id FROM whiteboard_objects WHERE kind = 'text');
  DELETE FROM whiteboard_objects WHERE kind = 'text';
  `
]
