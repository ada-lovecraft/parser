

CREATE TABLE "data_table" (
"user_id" INTEGER NOT NULL,
"keyword" TEXT NOT NULL
);


CREATE TABLE "user_table" (
"id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
"ip" TEXT,
"agent" TEXT,
"url" TEXT,
"referrer" TEXT,
"mobile" INTEGER DEFAULT 0
);
