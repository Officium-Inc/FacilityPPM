-- ============================================================
-- FacilityPPM — MySQL Schema
-- Converted from PostgreSQL/Supabase
-- Requires MySQL 8.0.13+ (DEFAULT (UUID()), JSON type, CHECK constraints)
-- Note: Supabase RLS policies have no MySQL equivalent and are omitted.
--       Enforce access control at the application/API layer instead.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- Tables
-- ============================================================

-- Properties (top-level client accounts managed by the provider)
CREATE TABLE properties (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  slug           VARCHAR(255) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  license_status VARCHAR(20)  NOT NULL DEFAULT 'trial',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_properties_slug (slug),
  CONSTRAINT chk_properties_license_status
    CHECK (license_status IN ('active', 'suspended', 'trial'))
);

-- Sites (belong to a property)
CREATE TABLE sites (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  property_id  CHAR(36)     NOT NULL,
  name         VARCHAR(255) NOT NULL,
  address      TEXT,
  city         VARCHAR(255),
  manager_name VARCHAR(255),
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_sites_property
    FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
);

-- Buildings
CREATE TABLE buildings (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()),
  site_id    CHAR(36),
  name       VARCHAR(255) NOT NULL,
  floors     INT,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_buildings_site
    FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE
);

-- Assets
CREATE TABLE assets (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  building_id     CHAR(36),
  name            VARCHAR(255) NOT NULL,
  category        VARCHAR(100),
  make            VARCHAR(100),
  model           VARCHAR(100),
  serial_no       VARCHAR(100),
  install_date    DATE,
  warranty_expiry DATE,
  location        VARCHAR(255),
  status          VARCHAR(50)  DEFAULT 'active',
  qr_code         TEXT,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_assets_building
    FOREIGN KEY (building_id) REFERENCES buildings (id) ON DELETE CASCADE
);

-- Roles
CREATE TABLE roles (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()),
  name        VARCHAR(100) NOT NULL,
  permissions JSON,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
);

-- Engineers
-- Note: user_id is a reference to your auth system's user identifier.
--       The Supabase auth.users foreign key is removed; enforce this in app code.
CREATE TABLE engineers (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  property_id    CHAR(36),
  user_id        CHAR(36),
  role_id        CHAR(36),
  full_name      VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  phone          VARCHAR(50),
  certifications TEXT,
  is_active      BOOLEAN      DEFAULT TRUE,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_engineers_property
    FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_engineers_role
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE SET NULL
);

-- PPM Schedules
CREATE TABLE ppm_schedules (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  asset_id      CHAR(36),
  title         VARCHAR(255) NOT NULL,
  frequency     VARCHAR(50),
  interval_days INT,
  next_due      DATE,
  priority      VARCHAR(20)  DEFAULT 'medium',
  is_active     BOOLEAN      DEFAULT TRUE,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_ppm_schedules_asset
    FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE CASCADE
);

-- Work Orders
CREATE TABLE work_orders (
  id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
  property_id         CHAR(36),
  schedule_id         CHAR(36),
  engineer_id         CHAR(36),
  wo_number           VARCHAR(50)  NOT NULL,
  type                VARCHAR(20)  DEFAULT 'ppm',
  status              VARCHAR(30)  DEFAULT 'scheduled',
  scheduled_date      DATE,
  completed_date      DATETIME,
  notes               TEXT,
  priority            VARCHAR(20)  DEFAULT 'medium',
  sign_off_token      VARCHAR(255),
  sign_off_expires_at DATETIME,
  signed_at           DATETIME,
  signed_by_name      VARCHAR(255),
  signed_by_ip        VARCHAR(45),
  signed_by_device    TEXT,
  signature_data      LONGTEXT,
  rejection_reason    TEXT,
  pdf_url             TEXT,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_work_orders_wo_number (wo_number),
  UNIQUE KEY uq_work_orders_sign_off_token (sign_off_token),
  CONSTRAINT fk_work_orders_property
    FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_work_orders_schedule
    FOREIGN KEY (schedule_id) REFERENCES ppm_schedules (id) ON DELETE SET NULL,
  CONSTRAINT fk_work_orders_engineer
    FOREIGN KEY (engineer_id) REFERENCES engineers (id) ON DELETE SET NULL
);

-- Checklist Items
CREATE TABLE checklist_items (
  id             CHAR(36)  NOT NULL DEFAULT (UUID()),
  work_order_id  CHAR(36),
  description    TEXT      NOT NULL,
  result         VARCHAR(100),
  remarks        TEXT,
  requires_photo BOOLEAN   DEFAULT FALSE,
  photo_urls     JSON,
  sort_order     INT       DEFAULT 0,
  created_at     DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_checklist_items_work_order
    FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE
);

-- Inventory Items (scoped to a property)
CREATE TABLE inventory_items (
  id            CHAR(36)      NOT NULL DEFAULT (UUID()),
  property_id   CHAR(36),
  part_name     VARCHAR(255)  NOT NULL,
  part_number   VARCHAR(100),
  category      VARCHAR(100),
  qty_on_hand   INT           DEFAULT 0,
  reorder_level INT           DEFAULT 5,
  supplier      VARCHAR(255),
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_inventory_items_property
    FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
);

-- Parts Used per Work Order
CREATE TABLE parts_used (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  work_order_id CHAR(36),
  item_id       CHAR(36),
  quantity_used INT          DEFAULT 1,
  unit_cost     DECIMAL(10,2),
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_parts_used_work_order
    FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_parts_used_item
    FOREIGN KEY (item_id) REFERENCES inventory_items (id) ON DELETE SET NULL
);

-- Audit Log (scoped to a property)
CREATE TABLE audit_log (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()),
  property_id CHAR(36),
  user_id     CHAR(36),
  action      VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id   CHAR(36),
  metadata    JSON,
  ip_address  VARCHAR(45),
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_audit_log_property
    FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_properties_slug             ON properties    (slug);
CREATE INDEX idx_sites_property_id           ON sites         (property_id);
CREATE INDEX idx_engineers_property_id       ON engineers     (property_id);
CREATE INDEX idx_work_orders_property_status ON work_orders   (property_id, status);
CREATE INDEX idx_work_orders_scheduled_date  ON work_orders   (scheduled_date);
CREATE INDEX idx_work_orders_sign_off_token  ON work_orders   (sign_off_token);
CREATE INDEX idx_ppm_schedules_next_due      ON ppm_schedules (next_due, is_active);
CREATE INDEX idx_checklist_items_wo_id       ON checklist_items (work_order_id);
CREATE INDEX idx_audit_log_property_entity   ON audit_log     (property_id, entity_type, entity_id, created_at);

-- Prevent the same auth user being added twice to the same property.
-- MySQL UNIQUE indexes allow multiple NULL values, so this behaves identically
-- to the PostgreSQL partial index: UNIQUE (user_id, property_id) WHERE user_id IS NOT NULL
ALTER TABLE engineers
  ADD UNIQUE KEY uq_engineers_user_property (user_id, property_id);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Seed Data
-- ============================================================

-- Roles
INSERT INTO roles (name) VALUES ('admin'), ('supervisor'), ('engineer'), ('viewer');

-- Demo Property
INSERT INTO properties (slug, name, license_status)
VALUES ('bgc-tower-3', 'BGC Tower 3', 'active');

-- Site
INSERT INTO sites (property_id, name, address, city, manager_name)
SELECT id, 'BGC Tower 3 Site', '32nd Street', 'Taguig', 'Ana Santos'
FROM properties WHERE slug = 'bgc-tower-3';

-- Building
INSERT INTO buildings (site_id, name, floors)
SELECT id, 'Main Tower', 30
FROM sites WHERE name = 'BGC Tower 3 Site';

-- Asset
INSERT INTO assets (building_id, name, category, make, model, location, status)
SELECT id, 'AHU-01 Level 3', 'HVAC', 'Daikin', 'FXMQ100', 'Level 3 Ceiling Void', 'active'
FROM buildings WHERE name = 'Main Tower';

-- Sample PPM Schedule
INSERT INTO ppm_schedules (asset_id, title, frequency, interval_days, next_due, priority)
SELECT id, 'Quarterly HVAC Filter Replacement', 'quarterly', 90,
       DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'high'
FROM assets WHERE name = 'AHU-01 Level 3';

-- Sample Work Order
INSERT INTO work_orders (property_id, schedule_id, wo_number, type, status, scheduled_date, priority)
SELECT p.id, s.id, 'WO-1042', 'ppm', 'assigned',
       DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'high'
FROM ppm_schedules s
JOIN properties p ON p.slug = 'bgc-tower-3'
WHERE s.title = 'Quarterly HVAC Filter Replacement';

-- Checklist Items for WO-1042
INSERT INTO checklist_items (work_order_id, description, sort_order)
SELECT wo.id, v.item_desc, v.item_ord
FROM work_orders wo
JOIN (
  SELECT 'AHU filter replacement (Level 3 unit)' AS item_desc, 1 AS item_ord UNION ALL
  SELECT 'Condensate drain cleared and flushed',                2              UNION ALL
  SELECT 'Fan belt tension and condition check',                3              UNION ALL
  SELECT 'Post-maintenance functional test run',                4
) AS v ON TRUE
WHERE wo.wo_number = 'WO-1042';
