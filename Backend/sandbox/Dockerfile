FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy

USER root
ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

# Pin exact Jammy package versions for reproducible builds.
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb=2:21.1.4-2ubuntu1.7~22.04.16 \
    x11vnc=0.9.16-8 \
    novnc=1:1.0.0-5 \
    websockify=0.10.0+dfsg1-2build1 \
    supervisor=4.2.1-1ubuntu1 \
    && python -m pip install --no-cache-dir playwright==1.58.0 \
    && rm -rf /var/lib/apt/lists/*

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 5900 6080

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
