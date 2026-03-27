alter table products
  add column if not exists style_name text,
  add column if not exists span_terms int;
