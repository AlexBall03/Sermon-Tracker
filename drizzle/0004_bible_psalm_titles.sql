CREATE TABLE "bible_psalm_titles" (
	"psalm" smallint PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "bible_psalm_titles_psalm_check" CHECK ("bible_psalm_titles"."psalm" between 1 and 150),
	CONSTRAINT "bible_psalm_titles_text_check" CHECK (char_length(btrim("bible_psalm_titles"."text")) > 0)
);
