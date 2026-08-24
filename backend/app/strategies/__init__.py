from .bollinger_awesome import BollingerAwesomeStrategy
from .bollinger_three_touch import BollingerThreeTouchStrategy

STRATEGIES = {
    "bollinger_awesome": BollingerAwesomeStrategy(),
    "bollinger_three_touch": BollingerThreeTouchStrategy(),
}
