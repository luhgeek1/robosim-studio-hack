"""Rule-based explanations. Every sentence is built from computed numbers only."""

from __future__ import annotations

from ..schemas import Explanation


def _f(v, d=1):
    if v is None:
        return "—"
    return f"{v:,.{d}f}".replace(",", " ").replace(".", ",")


class RuleBasedExplanationProvider:
    name = "rules"

    def explain_configuration(self, ctx: dict) -> dict[str, Explanation]:
        cfgs = {c["count"]: c for c in ctx["configurations"]}
        rec = ctx.get("recommended_count")
        robot = ctx["robot"]["short_name"]
        peak = ctx["sizing"]["required_throughput_peak"]
        target = ctx.get("target_sla", 95)
        if rec is None or rec not in cfgs:
            worst = max(cfgs.values(), key=lambda c: c["count"])
            return {
                "why": Explanation(title="Почему не рекомендуется", body=f"Даже {worst['count']} × {robot} дают {_f(worst['normal']['throughput'], 0)} паллет в час при пике {_f(peak, 0)} и SLA {_f(worst['normal']['sla'], 0)} % при требовании {target} %. Следующая конфигурация выходит за бюджет.", points=[f"SLA {_f(worst['normal']['sla'], 0)} %", f"CAPEX {_f(worst['econ']['capex_mln'])} млн ₽"]),
                "not_fewer": Explanation(title="Меньше роботов", body="Меньшее количество ещё сильнее не справляется с потоком.", points=[]),
                "not_more": Explanation(title="Больше роботов", body="Больше роботов не укладывается в бюджет.", points=[]),
            }
        c = cfgs[rec]
        lo = cfgs.get(rec - 1)
        hi = cfgs.get(rec + 1)
        why = Explanation(
            title=f"Почему {rec}",
            body=(f"{rec} робота — минимальная конфигурация, которая стабильно справляется с пиковой нагрузкой склада. "
                  f"Мощность {_f(c['normal']['throughput'], 0)} паллет в час при пике {_f(peak, 0)}, средняя очередь {_f(c['normal']['queue_avg'], 0)} паллет, "
                  f"роботы загружены на {_f(c['normal']['utilization'], 0)} % — есть запас на рост объёмов без простоя."),
            points=[f"SLA {_f(c['normal']['sla'], 0)} % в норме и {_f(c['peak']['sla'], 0)} % в пик",
                    f"Окупаемость {_f(c['econ']['payback_years'])} года — лучшая среди конфигураций" if c["econ"]["payback_years"] else "Окупаемость не достигается",
                    f"Запас мощности {_f(100 * (c['normal']['throughput'] / peak - 1), 0)} % к пику"],
        )
        if lo:
            diff = c["econ"]["capex_mln"] - lo["econ"]["capex_mln"]
            not_fewer = Explanation(
                title=f"Почему не {lo['count']}",
                body=(f"{lo['count']} робота дешевле на {_f(diff)} млн ₽, но не обеспечивают требуемую производительность в пиковые часы. "
                      f"Мощность {_f(lo['normal']['throughput'], 0)} паллет в час ниже пиковых {_f(peak, 0)}: на приёмке накапливается очередь до {_f(lo['normal']['queue_max'], 0)} паллет, "
                      f"роботы работают почти без остановок, SLA падает до {_f(lo['normal']['sla'], 0)} %."),
                points=[f"Дешевле на {_f(diff)} млн ₽", f"SLA {_f(lo['normal']['sla'], 0)} % при требовании {target} %", f"Загрузка {_f(lo['normal']['utilization'], 0)} % — нет запаса, любая пауза даёт сбой",
                        f"{_f(lo['econ']['manual_overflow_pallets'], 0)} паллет в сутки остаются на ручной обработке"],
            )
        else:
            not_fewer = Explanation(title="Меньше нельзя", body="Один робот не покрывает даже средний поток.", points=[])
        if hi:
            diff = hi["econ"]["capex_mln"] - c["econ"]["capex_mln"]
            not_more = Explanation(
                title=f"Почему не {hi['count']}",
                body=(f"{hi['count']} робота увеличивают мощность до {_f(hi['normal']['throughput'], 0)} паллет в час, но {_f(100 - hi['normal']['utilization'], 0)} % времени машины простаивают. "
                      f"Инвестиции выше на {_f(diff)} млн ₽, а выгода почти не растёт: окупаемость {_f(hi['econ']['payback_years'])} года против {_f(c['econ']['payback_years'])}, "
                      f"ROI за 5 лет {_f(hi['econ']['roi_5y'], 0)} % против {_f(c['econ']['roi_5y'], 0)} %."),
                points=[f"Дороже на {_f(diff)} млн ₽", f"Загрузка роботов {_f(hi['normal']['utilization'], 0)} % — простой", f"ROI 5 лет {_f(hi['econ']['roi_5y'], 0)} % против {_f(c['econ']['roi_5y'], 0)} %"],
            )
        else:
            not_more = Explanation(title="Больше не нужно", body="Дополнительные роботы не улучшают SLA, а инвестиции растут.", points=[])
        return {"why": why, "not_fewer": not_fewer, "not_more": not_more}

    def executive_summary(self, ctx: dict) -> str:
        if ctx["verdict"] == "not_recommended":
            return ctx["headline"] + " " + ctx["key_risk"]
        return (f"Рекомендуем {ctx['count']} × {ctx['robot']['short_name']}: инвестиции {_f(ctx['capex_mln'])} млн ₽, окупаемость {_f(ctx['payback_years'])} года, "
                f"ROI за 5 лет {_f(ctx['roi_5y'], 0)} %, ожидаемый SLA {_f(ctx['sla'], 0)} %. Это минимальная конфигурация, которая стабильно справляется "
                f"с пиковой нагрузкой и укладывается в бюджет.")
