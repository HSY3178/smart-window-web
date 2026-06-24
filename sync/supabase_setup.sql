-- 在 Supabase 控制台 → SQL Editor 中执行此脚本
-- 修复 sensor_data 表，使设备/前端 INSERT 无需手动填 id

-- 1) id 自增（保留已有数据）
CREATE SEQUENCE IF NOT EXISTS sensor_data_id_seq;
SELECT setval(
    'sensor_data_id_seq',
    COALESCE((SELECT MAX(id) FROM public.sensor_data), 0) + 1,
    false
);
ALTER TABLE public.sensor_data
    ALTER COLUMN id SET DEFAULT nextval('sensor_data_id_seq');
ALTER SEQUENCE sensor_data_id_seq OWNED BY public.sensor_data.id;

-- 2) created_at 默认当前时间
ALTER TABLE public.sensor_data
    ALTER COLUMN created_at SET DEFAULT now();

-- 3) 建议列类型（若已是 numeric/real 可跳过）
-- ALTER TABLE public.sensor_data ALTER COLUMN temperature TYPE real USING temperature::real;

-- 4) Realtime：Database → Publications → supabase_realtime → 勾选 sensor_data

-- 5) RLS：开发阶段可关闭；若开启需添加 anon 读写策略
