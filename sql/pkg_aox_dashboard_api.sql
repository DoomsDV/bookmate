PROMPT CREATE OR REPLACE PACKAGE pkg_aox_dashboard_api
CREATE OR REPLACE PACKAGE pkg_aox_dashboard_api IS

    PROCEDURE pr_get_main_dashboard(
        pi_auth_header   IN  VARCHAR2,
        po_status_code   OUT NUMBER,
        po_response_body OUT CLOB
    );

END pkg_aox_dashboard_api;
/

PROMPT CREATE OR REPLACE PACKAGE BODY pkg_aox_dashboard_api
CREATE OR REPLACE PACKAGE BODY pkg_aox_dashboard_api IS

    c_timezone          CONSTANT VARCHAR2(64) := 'America/Asuncion';
    c_upcoming_days     CONSTANT PLS_INTEGER  := 7;
    c_status_canceled   CONSTANT VARCHAR2(20) := 'CANCELADO';

    PROCEDURE pr_get_main_dashboard(
        pi_auth_header   IN  VARCHAR2,
        po_status_code   OUT NUMBER,
        po_response_body OUT CLOB
    ) IS
        v_user_id          NUMBER;
        v_org_id           NUMBER;
        v_role_id          NUMBER;
        v_prof_id          NUMBER := -1;

        v_now_local        TIMESTAMP;
        v_today_start      TIMESTAMP;
        v_tomorrow_start   TIMESTAMP;
        v_window_end       TIMESTAMP;

        v_response_json    json_object_t := json_object_t();
        v_data_obj         json_object_t := json_object_t();
        v_kpis_obj         json_object_t := json_object_t();
        v_meta_obj         json_object_t := json_object_t();
        v_upcoming_arr     json_array_t  := json_array_t();
        v_appt_obj         json_object_t;

        v_today_count      NUMBER := 0;
        v_pending_count    NUMBER := 0;
        v_my_customers     NUMBER := 0;
        v_total_org        NUMBER := 0;
    BEGIN
        v_user_id := pkg_aox_util.fn_get_user_id_from_jwt(pi_auth_header);
        v_org_id  := pkg_aox_util.fn_get_org_id_from_jwt(pi_auth_header);
        v_role_id := pkg_aox_util.fn_get_role_id_from_jwt(pi_auth_header);

        IF NVL(v_org_id, 0) <= 0 THEN
            RAISE_APPLICATION_ERROR(-20001, 'No autorizado.');
        END IF;

        v_now_local      := CAST(SYSTIMESTAMP AT TIME ZONE c_timezone AS TIMESTAMP);
        v_today_start    := CAST(TRUNC(v_now_local) AS TIMESTAMP);
        v_tomorrow_start := v_today_start + NUMTODSINTERVAL(1, 'DAY');
        v_window_end     := v_now_local + NUMTODSINTERVAL(c_upcoming_days, 'DAY');

        BEGIN
            SELECT id_professional
            INTO v_prof_id
            FROM professional
            WHERE usr_id_user = v_user_id
              AND org_id_organization = v_org_id;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                v_prof_id := -1;
        END;

        SELECT COUNT(*)
        INTO v_today_count
        FROM appointment
        WHERE org_id_organization = v_org_id
          AND (v_role_id = 1 OR pro_id_professional = v_prof_id)
          AND start_time >= v_today_start
          AND start_time < v_tomorrow_start
          AND status <> c_status_canceled;

        SELECT COUNT(*)
        INTO v_pending_count
        FROM appointment
        WHERE org_id_organization = v_org_id
          AND (v_role_id = 1 OR pro_id_professional = v_prof_id)
          AND start_time >= v_now_local
          AND status IN ('PENDIENTE', 'CONFIRMADO');

        SELECT COUNT(DISTINCT cus_id_customer)
        INTO v_my_customers
        FROM appointment
        WHERE org_id_organization = v_org_id
          AND pro_id_professional = v_prof_id
          AND status <> c_status_canceled;

        IF v_role_id = 1 THEN
            SELECT COUNT(*)
            INTO v_total_org
            FROM customer
            WHERE org_id_organization = v_org_id;
        END IF;

        v_kpis_obj.put('today_appointments', v_today_count);
        v_kpis_obj.put('pending_appointments', v_pending_count);
        v_kpis_obj.put('my_customers', v_my_customers);

        IF v_role_id = 1 THEN
            v_kpis_obj.put('total_customers', v_total_org);
        ELSE
            v_kpis_obj.put_null('total_customers');
        END IF;

        FOR rec IN (
            SELECT
                a.id_appointment,
                c.full_name AS customer_name,
                TO_CHAR(a.start_time, 'YYYY-MM-DD') AS appointment_date,
                TO_CHAR(a.start_time, 'HH24:MI') AS time_start,
                TO_CHAR(a.end_time, 'HH24:MI') AS time_end,
                s.name AS service_name,
                a.status
            FROM appointment a
            JOIN customer c
              ON c.id_customer = a.cus_id_customer
            LEFT JOIN service s
              ON s.id_service = a.ser_id_service
            WHERE a.org_id_organization = v_org_id
              AND (v_role_id = 1 OR a.pro_id_professional = v_prof_id)
              AND a.start_time >= v_now_local
              AND a.start_time < v_window_end
              AND a.status IN ('PENDIENTE', 'CONFIRMADO', 'COMPLETADO')
            ORDER BY a.start_time ASC
        ) LOOP
            v_appt_obj := json_object_t();
            v_appt_obj.put('id', rec.id_appointment);
            v_appt_obj.put('customer_name', rec.customer_name);
            v_appt_obj.put('appointment_date', rec.appointment_date);
            v_appt_obj.put('time_start', rec.time_start);
            v_appt_obj.put('time_end', rec.time_end);
            v_appt_obj.put('service_name', NVL(rec.service_name, 'Servicio'));
            v_appt_obj.put('status', rec.status);
            v_upcoming_arr.append(v_appt_obj);
        END LOOP;

        v_meta_obj.put('timezone', c_timezone);
        v_meta_obj.put('upcoming_window_days', c_upcoming_days);
        v_meta_obj.put('generated_at_local', TO_CHAR(v_now_local, 'YYYY-MM-DD"T"HH24:MI:SS'));

        v_data_obj.put('kpis', v_kpis_obj);
        v_data_obj.put('upcoming_appointments', v_upcoming_arr);
        v_data_obj.put('meta', v_meta_obj);

        po_status_code := pkg_aox_util.c_success_ok_code;
        v_response_json.put('status', 'success');
        v_response_json.put('data', v_data_obj);
        po_response_body := v_response_json.to_clob();

    EXCEPTION
        WHEN OTHERS THEN
            po_status_code := CASE
                WHEN SQLCODE = -20001 THEN pkg_aox_util.c_unauthorized_code
                ELSE pkg_aox_util.c_internal_error_code
            END;

            v_response_json := json_object_t();
            v_response_json.put('status', 'error');
            v_response_json.put('message', REGEXP_REPLACE(SQLERRM, '^ORA-[0-9]+: ', ''));
            po_response_body := v_response_json.to_clob();
    END pr_get_main_dashboard;

END pkg_aox_dashboard_api;
/
