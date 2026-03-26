alter table products
  add column if not exists allowed_style_ids uuid[],
  add column if not exists allowed_style_names text[];
